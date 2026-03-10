import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStructuredMarkdown, stripLeadingLabel } from "./lib/complete-draft.mjs";
import { exists, readJsonIfExists, readTextIfExists, splitFrontmatter } from "./lib/novel-project.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const docsDir = path.join(rootDir, "docs");
const manuscriptPath = path.join(rootDir, "project", "manuscript", "full_novel.md");
const overviewPath = path.join(rootDir, "project", "00_project_overview.md");
const chapterCoverPromptPath = path.join(rootDir, "prompts", "chapter-cover-images.json");
const templateDir = path.join(rootDir, "soudoku-novel-builder", "assets", "mobile-reader");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTitleDisplayLines(title, subtitle) {
  if (subtitle) {
    const subtitleLines = subtitle.length > 18
      ? [
          "〜異世界転生したので猫耳ともふもふに",
          "囲まれてのんびり暮らしたい〜",
        ]
      : [subtitle];

    return [title, "", ...subtitleLines];
  }

  const commaIndex = title.indexOf("、");
  if (commaIndex !== -1 && commaIndex < title.length - 1) {
    return [title.slice(0, commaIndex + 1), title.slice(commaIndex + 1)];
  }

  return [title];
}

function buildFullTitle(title, subtitle) {
  return subtitle ? `${title} ${subtitle}` : title;
}


async function cleanDocsDir() {
  const entries = await readdir(docsDir).catch(() => []);
  await Promise.all(entries.map((entry) => rm(path.join(docsDir, entry), { recursive: true, force: true })));
}

async function copyDirIfExists(sourceDir, targetDir, matcher) {
  if (!(await exists(sourceDir))) {
    return;
  }

  const entries = await readdir(sourceDir, { withFileTypes: true });
  await mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    if (!entry.isFile() || (matcher && !matcher(entry.name))) {
      continue;
    }
    await copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
  }
}

async function loadTemplates() {
  const [indexTemplate, appJs, stylesCss] = await Promise.all([
    readFile(path.join(templateDir, "index.html"), "utf8"),
    readFile(path.join(templateDir, "app.js"), "utf8"),
    readFile(path.join(templateDir, "styles.css"), "utf8"),
  ]);

  return { indexTemplate, appJs, stylesCss };
}

async function main() {
  const [overviewSource, manuscriptSource, coverPromptConfig, templates] = await Promise.all([
    readTextIfExists(overviewPath),
    readFile(manuscriptPath, "utf8"),
    readJsonIfExists(chapterCoverPromptPath, { chapters: [] }),
    loadTemplates(),
  ]);

  const { attributes: meta } = splitFrontmatter(overviewSource || "");
  const novel = parseStructuredMarkdown(manuscriptSource, { title: meta.title || "Web Novel" });
  const moodMap = new Map((coverPromptConfig.chapters || []).map((entry) => [entry.id, entry.mood || "sunrise"]));
  const titleImagePath = path.join(rootDir, "project", "assets", "title", "title-cover.webp");
  const baseTitle = meta.title || novel.title || "Web Novel";
  const subtitle = meta.subtitle || "";
  const fullTitle = buildFullTitle(baseTitle, subtitle);

  const story = {
    title: baseTitle,
    subtitle,
    fullTitle,
    author: meta.author || "",
    genre: meta.genre || "",
    slug: meta.slug || "",
    status: meta.status || "draft",
    generatedAt: new Date().toISOString(),
    chapterCount: novel.chapterCount,
    talkCount: novel.talkCount,
    titleDisplayLines: buildTitleDisplayLines(baseTitle, subtitle),
    titleImage: (await exists(titleImagePath)) ? "./images/title/title-cover.webp" : null,
    titleImageAlt: `${fullTitle} の装画`,
    chapters: novel.chapters.map((chapter) => ({
      id: chapter.id,
      label: chapter.label,
      title: chapter.fullTitle,
      displayTitle: stripLeadingLabel(chapter.fullTitle, chapter.label),
      mood: moodMap.get(chapter.id) || "sunrise",
      coverImage: `./images/chapters/${chapter.id}.webp`,
      coverAlt: `${chapter.fullTitle} の章扉絵`,
      talks: chapter.talks.map((talk) => ({
        id: talk.id,
        label: talk.label,
        title: talk.fullTitle,
        displayTitle: stripLeadingLabel(talk.fullTitle, talk.label),
        paragraphs: talk.paragraphs,
      })),
    })),
  };

  await mkdir(docsDir, { recursive: true });
  await cleanDocsDir();

  await Promise.all([
    copyDirIfExists(path.join(rootDir, "project", "assets", "title"), path.join(docsDir, "images", "title"), (name) => /\.webp$/i.test(name)),
    copyDirIfExists(
      path.join(rootDir, "project", "assets", "characters"),
      path.join(docsDir, "images", "characters"),
      (name) => /\.(png|webp|svg)$/i.test(name) && !/\.raw\./i.test(name),
    ),
    copyDirIfExists(path.join(rootDir, "project", "assets", "chapters"), path.join(docsDir, "images", "chapters"), (name) => /\.(webp|svg)$/i.test(name) && !/\.raw\./i.test(name)),
    copyDirIfExists(path.join(rootDir, "project", "assets", "ui"), path.join(docsDir, "images", "ui"), (name) => /\.(svg|png|webp)$/i.test(name)),
  ]);

  const description = `${story.fullTitle} を章扉絵付きのモバイル Web 小説として読める静的サイト。`;
  const indexHtml = templates.indexTemplate
    .replace("__TITLE__", escapeHtml(story.fullTitle))
    .replace("__DESCRIPTION__", escapeHtml(description));

  await Promise.all([
    writeFile(path.join(docsDir, "story-data.js"), `window.STORY_DATA = ${JSON.stringify(story, null, 2)};\n`, "utf8"),
    writeFile(path.join(docsDir, "index.html"), indexHtml, "utf8"),
    writeFile(path.join(docsDir, "app.js"), templates.appJs, "utf8"),
    writeFile(path.join(docsDir, "styles.css"), templates.stylesCss, "utf8"),
    writeFile(path.join(docsDir, ".nojekyll"), "", "utf8"),
  ]);

  process.stdout.write(`Built mobile web novel: ${story.chapterCount} chapters / ${story.talkCount} talks -> docs\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
