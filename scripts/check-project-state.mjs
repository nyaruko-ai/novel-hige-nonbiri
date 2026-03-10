import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStructuredMarkdown } from "./lib/complete-draft.mjs";
import { exists, readJsonIfExists, readTextIfExists, splitFrontmatter } from "./lib/novel-project.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function statusLine(label, ok, detail) {
  return `${ok ? "[ok]" : "[ ]"} ${label}: ${detail}`;
}

async function countFiles(dirPath, pattern) {
  if (!(await exists(dirPath))) {
    return 0;
  }

  const { readdir } = await import("node:fs/promises");
  return (await readdir(dirPath)).filter((fileName) => pattern.test(fileName)).length;
}

async function main() {
  const overviewPath = path.join(rootDir, "project", "00_project_overview.md");
  const charactersPath = path.join(rootDir, "project", "02_characters.md");
  const outlinePath = path.join(rootDir, "project", "04_chapter_outline.md");
  const summariesPath = path.join(rootDir, "project", "06_chapter_summaries.md");
  const manuscriptPath = path.join(rootDir, "project", "manuscript", "full_novel.md");
  const storyDataPath = path.join(rootDir, "docs", "story-data.js");
  const portraitPromptPath = path.join(rootDir, "prompts", "character-portraits.json");
  const chapterPromptPath = path.join(rootDir, "prompts", "chapter-cover-images.json");

  const [overviewSource, charactersSource, outlineSource, summariesSource, manuscriptSource] = await Promise.all([
    readTextIfExists(overviewPath),
    readTextIfExists(charactersPath),
    readTextIfExists(outlinePath),
    readTextIfExists(summariesPath),
    readTextIfExists(manuscriptPath),
  ]);

  const overview = splitFrontmatter(overviewSource || "");
  const storyBuilt = await exists(storyDataPath);
  const portraitPrompt = await readJsonIfExists(portraitPromptPath, { characters: [] });
  const chapterPrompt = await readJsonIfExists(chapterPromptPath, { chapters: [] });
  const characterImages = await countFiles(path.join(rootDir, "project", "assets", "characters"), /^(?!.*\.raw\.).*\.(png|webp)$/i);
  const chapterImages = await countFiles(path.join(rootDir, "project", "assets", "chapters"), /^(?!.*\.raw\.).*\.webp$/i);
  const uiAssets = await countFiles(path.join(rootDir, "project", "assets", "ui"), /\.(svg|png|webp)$/i);

  let novel = null;
  if (manuscriptSource.trim()) {
    novel = parseStructuredMarkdown(manuscriptSource, { title: overview.attributes.title || "Web Novel" });
  }

  const nextSteps = [];
  if (!manuscriptSource.trim()) {
    nextSteps.push("`node scripts/import-draft-manuscript.mjs 草稿/初稿.md` で本文を取り込む");
  }
  if (!charactersSource.trim() || portraitPrompt.characters.length === 0) {
    nextSteps.push("`node scripts/extract-characters-from-draft.mjs` でキャラクター設定と画像定義を生成する");
  }
  if (!summariesSource.trim() || chapterPrompt.chapters.length === 0) {
    nextSteps.push("`node scripts/build-chapter-summaries.mjs` で章あらすじと扉絵定義を生成する");
  }
  if (characterImages === 0) {
    nextSteps.push("`node scripts/generate-character-portrait.mjs --all` でキャラクター画像を生成する");
  }
  if (chapterImages === 0) {
    nextSteps.push("`node scripts/generate-chapter-cover.mjs --all` で章扉絵を生成する");
  }
  if (uiAssets === 0) {
    nextSteps.push("`node scripts/generate-ui-textures.mjs` で UI 背景素材を生成する");
  }
  if (!storyBuilt) {
    nextSteps.push("`node scripts/build-web-novel.mjs` で Web UI をビルドする");
  }

  process.stdout.write("# Project State\n\n");
  process.stdout.write(`Title: ${overview.attributes.title || "未設定"}\n`);
  process.stdout.write(`Status: ${overview.attributes.status || "未設定"}\n\n`);
  process.stdout.write(`${statusLine("project overview", overviewSource.length > 0, "基本情報と入力原稿")}\n`);
  process.stdout.write(
    `${statusLine("chapter outline", outlineSource.length > 0, novel ? `${novel.chapterCount} chapters` : "未取込")}\n`,
  );
  process.stdout.write(
    `${statusLine("manuscript", manuscriptSource.length > 0, novel ? `${novel.talkCount} talks` : "未取込")}\n`,
  );
  process.stdout.write(
    `${statusLine("characters", charactersSource.length > 0, `${portraitPrompt.characters.length} prompt entries / ${characterImages} images`)}\n`,
  );
  process.stdout.write(
    `${statusLine("chapter summaries", summariesSource.length > 0, `${chapterPrompt.chapters.length} prompt entries / ${chapterImages} images`)}\n`,
  );
  process.stdout.write(`${statusLine("ui assets", uiAssets > 0, `${uiAssets} files`)}\n`);
  process.stdout.write(`${statusLine("web build", storyBuilt, storyBuilt ? "docs/story-data.js exists" : "未ビルド")}\n`);

  if (nextSteps.length > 0) {
    process.stdout.write(`\n## Suggested Next Steps\n- ${nextSteps.join("\n- ")}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
