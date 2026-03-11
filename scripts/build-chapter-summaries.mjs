import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseStructuredMarkdown,
  stripLeadingLabel,
  summarizeChapter,
  summarizeTalk,
} from "./lib/complete-draft.mjs";
import { readJsonIfExists } from "./lib/novel-project.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const manuscriptPath = path.join(rootDir, "project", "manuscript", "full_novel.md");
const outputMarkdownPath = path.join(rootDir, "project", "06_chapter_summaries.md");
const outputPromptPath = path.join(rootDir, "prompts", "chapter-cover-images.json");
const characterPromptPath = path.join(rootDir, "prompts", "character-portraits.json");

const moods = [
  "sunrise",
  "grove",
  "mist",
  "river",
  "ember",
  "harvest",
  "night",
];

function buildSummaryMarkdown(novel, chapterEntries) {
  const blocks = [
    "# Chapter Summaries",
    "",
    `- 作品名: ${novel.title}`,
    `- 章数: ${novel.chapterCount}`,
    `- 話数: ${novel.talkCount}`,
  ];

  for (const entry of chapterEntries) {
    blocks.push("");
    blocks.push(`## ${entry.chapter.fullTitle}`);
    blocks.push(entry.summary);
    blocks.push("");
    blocks.push("### 収録話");
    for (const talk of entry.chapter.talks) {
      blocks.push(`- ${talk.fullTitle}: ${summarizeTalk(talk, 110)}`);
    }
  }

  return `${blocks.join("\n")}\n`;
}

function detectReferenceCharacters(chapter, characters) {
  const corpus = [chapter.fullTitle, ...chapter.talks.map((talk) => talk.fullTitle)].join("\n");
  const matched = characters
    .filter((character) => corpus.includes(character.name))
    .map((character) => character.id);

  const defaults = ["sato", "nia", "shirotama"].filter((id) =>
    characters.some((character) => character.id === id),
  );

  return [...matched, ...defaults].filter((id, index, array) => array.indexOf(id) === index).slice(0, 3);
}

function buildPromptFile(chapterEntries, characterPromptFile) {
  const characters = characterPromptFile.characters || [];

  return {
    spec: {
      globalPrompt:
        "Create a premium vertical watercolor chapter-frontispiece for a Japanese mobile web novel. Use layered washes, restrained linework, atmospheric perspective, paper grain, and an artful literary mood. Favor elegant scenic composition over poster-like action. Do not render any visible text, typography, letters, captions, signage, title cards, or symbols that read like writing inside the image.",
      globalNegativePrompt:
        "text, typography, letters, words, caption, title card, signage, logo, watermark, UI labels, split panels, collage, crowded action montage, deformed anatomy, photorealistic rendering, hard cel shading",
      fixedWidth: 1440,
      fixedHeight: 1920,
      outputDir: "project/assets/chapters",
      defaultModel: "gemini-3.1-flash-image-preview",
    },
    chapters: chapterEntries.map((entry) => {
      const shortTitle = stripLeadingLabel(entry.chapter.fullTitle, entry.chapter.label);
      const talkHighlights = entry.chapter.talks
        .slice(0, 4)
        .map((talk) => stripLeadingLabel(talk.fullTitle, talk.label))
        .join("、");
      const referenceCharacterIds = detectReferenceCharacters(entry.chapter, characters);
      const referenceImages = referenceCharacterIds
        .map((id) => characters.find((character) => character.id === id))
        .filter(Boolean)
        .map((character) => `project/assets/characters/${character.id}.png`);

      return {
        id: entry.chapter.id,
        chapterLabel: entry.chapter.label,
        chapterTitle: entry.chapter.fullTitle,
        mood: entry.mood,
        model: "gemini-3.1-flash-image-preview",
        referenceCharacterIds,
        referenceImages,
        prompt: `${shortTitle} を象徴する章扉絵。${entry.summary} 印象的な要素は ${talkHighlights}。人物を入れる場合は 1 から 3 人までに絞り、必要に応じて俯瞰的な風景の中へ小さく配置する。風景や建築や地形が主役の章では、キャラクターを前面に出しすぎず、暮らしの気配として溶け込ませる。`,
        negativePrompt: "avoid battle-poster composition, overstuffed multi-scene storytelling, and oversized character-only composition when the chapter is place-driven",
      };
    }),
  };
}

async function main() {
  const [manuscriptSource, characterPromptFile] = await Promise.all([
    readFile(manuscriptPath, "utf8"),
    readJsonIfExists(characterPromptPath, { characters: [] }),
  ]);
  const novel = parseStructuredMarkdown(manuscriptSource);
  const chapterEntries = novel.chapters.map((chapter, index) => ({
    chapter,
    summary: summarizeChapter(chapter, 180),
    mood: moods[index % moods.length],
  }));

  await Promise.all([
    writeFile(outputMarkdownPath, buildSummaryMarkdown(novel, chapterEntries), "utf8"),
    writeFile(
      outputPromptPath,
      `${JSON.stringify(buildPromptFile(chapterEntries, characterPromptFile), null, 2)}\n`,
      "utf8",
    ),
  ]);

  process.stdout.write(
    `Wrote chapter summaries and cover prompts for ${chapterEntries.length} chapters\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
