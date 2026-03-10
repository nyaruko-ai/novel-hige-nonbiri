import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildOutlineMarkdown,
  parseDraftManuscript,
  stripLeadingLabel,
  toMarkdownDocument,
} from "./lib/complete-draft.mjs";
import { slugify } from "./lib/novel-project.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    source: argv[2] || "草稿/初稿.md",
    title: "おっさんサトー、樹海でのんびり開拓生活",
    subtitle: "",
    author: "",
    genre: "異世界開拓スローライフ",
  };

  for (const arg of argv.slice(3)) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const separatorIndex = arg.indexOf("=");
    const key = separatorIndex === -1 ? arg.slice(2) : arg.slice(2, separatorIndex);
    const value = separatorIndex === -1 ? "true" : arg.slice(separatorIndex + 1);
    if (key in options) {
      options[key] = value;
    }
  }

  return options;
}

function buildOverview(options, novel) {
  const now = new Date().toISOString();
  return `---
title: "${options.title}"
subtitle: "${options.subtitle}"
author: "${options.author}"
genre: "${options.genre}"
slug: "${slugify(options.title)}"
status: "imported-from-complete-draft"
sourceDraft: "${options.source}"
updatedAt: "${now}"
---

# Project Overview

## Source
- 取込元: ${options.source}
- 章数: ${novel.chapterCount}
- 話数: ${novel.talkCount}
- 段落数: ${novel.paragraphCount}

## Workflow
- 起点: 完成済み原稿の構造化
- 構成単位: 章 > 話
- 現在の目的: キャラクター抽出、章あらすじ作成、扉絵生成、モバイル Web ビルド

## Product Intent
- 主役は本文
- 画像は章扉絵とキャラクタービジュアルに絞る
- 背景は読書性を壊さない静かな SVG / CSS 表現を使う

## Current Focus
- 原稿取込: 完了
- キャラクター抽出: 次工程
- 章あらすじ: 次工程
- Web UI: 章扉絵型へ改修する
`;
}

function buildPlot(novel) {
  const chapters = novel.chapters;
  const first = chapters[0];
  const middle = chapters[Math.floor(Math.max(0, chapters.length - 1) / 2)];
  const last = chapters[chapters.length - 1];

  return `# Plot

## Premise
${novel.title} は、${stripLeadingLabel(first?.fullTitle || "", first?.label || "")} から始まり、${stripLeadingLabel(last?.fullTitle || "", last?.label || "")} へ至る、章積み上げ型の異世界開拓譚として整理する。

## Arc Overview
### Beginning
- ${first?.fullTitle || ""}

### Middle
- ${middle?.fullTitle || ""}

### Ending
- ${last?.fullTitle || ""}

## Structural Notes
- 完成原稿を基準とする
- 本文の再創作は行わず、構造化と出版向け整備を主目的にする
`;
}

function buildWorldbuilding(novel) {
  const locationHints = novel.chapters
    .slice(0, 8)
    .map((chapter) => stripLeadingLabel(chapter.fullTitle, chapter.label))
    .join(" / ");

  return `# Worldbuilding

## Setting Summary
- 完成原稿から読む限り、物語の主舞台はミルフィ村、ベルノア樹海、ひだまり盆地を軸に展開する。

## Spatial Notes
- 初期章のキーワード: ${locationHints}

## Rules To Preserve
- 日常と開拓の積み上げを壊さない
- 樹海の神秘と共同体形成を両立させる
- 戦闘や事件よりも生活の具体と関係性の変化を重視する
`;
}

function buildStyleGuide() {
  return `# Style Guide

## Reading Experience
- スマホ縦読みを最優先する
- 話ごとのまとまりを保ちつつ、段落は読みやすい余白で見せる
- 背景は静かで、本文コントラストを落とさない

## Visual Direction
- キャラクター画像: 温度感のある人物表現
- 章扉絵: 章の入口として空気感を示す
- 本文背景: 和紙、木漏れ日、柔らかな布地、薄いインクのにじみのような静かな表情

## UI Rules
- 構成は章 > 話
- 章の入口に扉絵を 1 枚置く
- 話ごとに画像を挟み込まない
`;
}

function buildManuscriptOverview(novel) {
  const firstChapter = novel.chapters[0];
  const lastChapter = novel.chapters[novel.chapters.length - 1];

  return `# Manuscript Overview

## Source Status
- 取込済み原稿: ${novel.chapterCount}章 / ${novel.talkCount}話
- 先頭章: ${firstChapter?.fullTitle || ""}
- 末尾章: ${lastChapter?.fullTitle || ""}

## Publication Pipeline
- 本文 Markdown 整形
- キャラクター設定抽出
- 章あらすじ生成
- キャラクター画像生成
- 章扉絵生成
- モバイル Web ビルド
`;
}

function buildCharacterPromptSkeleton() {
  return {
    spec: {
      globalPrompt:
        "Create a refined, story-rich vertical portrait for a literary mobile web novel. Keep faces readable, costume details grounded, and the overall tone warm and cinematic.",
      globalNegativePrompt:
        "text, logo, watermark, split panel, extra limbs, distorted anatomy, flat generic fantasy poster",
      fixedWidth: 1080,
      fixedHeight: 1920,
      outputDir: "project/assets/characters",
      defaultModel: "gemini-3.1-flash-image-preview",
    },
    characters: [],
  };
}

function buildTitlePrompt(options) {
  return {
    spec: {
      globalPrompt:
        "Create a premium vertical cover illustration for a Japanese mobile web novel. Preserve realism of materials and keep the mood calm, inviting, and literary.",
      globalNegativePrompt:
        "text, logo, watermark, busy collage, split panels, hard comic style",
      fixedWidth: 1440,
      fixedHeight: 2304,
    },
    titleImage: {
      id: "title-cover",
      model: "gemini-3.1-flash-image-preview",
      outputDir: "project/assets/title",
      referenceImages: [],
      prompt: `${options.title} の世界観を象徴する縦長の装画。樹海の静けさ、開拓の温もり、共同体が育つ気配を同時に感じさせる。`,
      negativePrompt: "avoid action-heavy battle poster composition",
    },
  };
}

async function ensureProjectDirectories() {
  await Promise.all([
    mkdir(path.join(rootDir, "project", "manuscript"), { recursive: true }),
    mkdir(path.join(rootDir, "project", "assets", "characters"), { recursive: true }),
    mkdir(path.join(rootDir, "project", "assets", "chapters"), { recursive: true }),
    mkdir(path.join(rootDir, "project", "assets", "title"), { recursive: true }),
    mkdir(path.join(rootDir, "project", "assets", "ui"), { recursive: true }),
    mkdir(path.join(rootDir, "prompts"), { recursive: true }),
  ]);
}

async function main() {
  const options = parseArgs(process.argv);
  const sourcePath = path.join(rootDir, options.source);
  const draftSource = await readFile(sourcePath, "utf8");
  const novel = parseDraftManuscript(draftSource, { title: options.title });

  await ensureProjectDirectories();

  await Promise.all([
    writeFile(path.join(rootDir, "project", "00_project_overview.md"), buildOverview(options, novel), "utf8"),
    writeFile(path.join(rootDir, "project", "01_plot.md"), buildPlot(novel), "utf8"),
    writeFile(path.join(rootDir, "project", "03_worldbuilding.md"), buildWorldbuilding(novel), "utf8"),
    writeFile(path.join(rootDir, "project", "04_chapter_outline.md"), buildOutlineMarkdown(novel), "utf8"),
    writeFile(path.join(rootDir, "project", "05_style_guide.md"), buildStyleGuide(), "utf8"),
    writeFile(
      path.join(rootDir, "project", "manuscript", "00_manuscript_overview.md"),
      buildManuscriptOverview(novel),
      "utf8",
    ),
    writeFile(
      path.join(rootDir, "project", "manuscript", "full_novel.md"),
      toMarkdownDocument(novel),
      "utf8",
    ),
    writeFile(
      path.join(rootDir, "prompts", "character-portraits.json"),
      `${JSON.stringify(buildCharacterPromptSkeleton(), null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(rootDir, "prompts", "title-image.json"),
      `${JSON.stringify(buildTitlePrompt(options), null, 2)}\n`,
      "utf8",
    ),
  ]);

  process.stdout.write(
    `Imported ${options.source} -> project/manuscript/full_novel.md (${novel.chapterCount} chapters / ${novel.talkCount} talks)\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
