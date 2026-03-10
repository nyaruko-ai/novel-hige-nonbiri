import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, exists, slugify } from "./lib/novel-project.mjs";
import { writeFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

export const RETAINED_INFRA_PATHS = [
  ".env",
  ".env.example",
  ".gitignore",
  "AGENTS.md",
  "README.md",
  "package.json",
  "package-lock.json",
  "scripts/",
  "soudoku-novel-builder/",
];

export const RESETTABLE_WORKSPACE_PATHS = [
  "docs/",
  "project/",
  "prompts/",
  "草稿/",
];

export const MINIMAL_SCAFFOLD_PATHS = [
  "草稿/README.md",
  "草稿/初稿.md",
  "project/00_project_overview.md",
  "project/01_plot.md",
  "project/02_characters.md",
  "project/03_worldbuilding.md",
  "project/04_chapter_outline.md",
  "project/05_style_guide.md",
  "project/06_chapter_summaries.md",
  "project/manuscript/00_manuscript_overview.md",
  "project/manuscript/full_novel.md",
  "prompts/character-portraits.json",
  "prompts/chapter-cover-images.json",
  "prompts/title-image.json",
  "docs/.nojekyll",
];

function parseArgs(argv) {
  const options = {
    title: "新しい小説プロジェクト",
    subtitle: "",
    author: "",
    genre: "異世界小説",
    sourceDraft: "草稿/初稿.md",
    slug: "",
    dryRun: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

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

function buildOverviewTemplate(options) {
  const slug = options.slug || slugify(options.title);
  const nowIso = new Date().toISOString();

  return `---
title: "${options.title}"
subtitle: "${options.subtitle}"
author: "${options.author}"
genre: "${options.genre}"
slug: "${slug}"
status: "ready-for-draft-import"
sourceDraft: "${options.sourceDraft}"
updatedAt: "${nowIso}"
---

# Project Overview

## Source
- 取込元予定: ${options.sourceDraft}
- 状態: 完成原稿待ち

## Workflow
- 起点: 完成済み原稿の構造化
- 構成単位: 章 > 話
- 現在の目的: 原稿取込の準備

## Product Intent
- 主役は本文
- 画像はキャラクター画像、章扉絵、タイトル画像に絞る
- 背景は読書性を壊さない静かな SVG / CSS 表現を使う

## Current Focus
- 原稿配置: ${options.sourceDraft} に完成原稿を置く
- 次工程: import-draft-manuscript.mjs
`;
}

function buildPlotTemplate() {
  return `# Plot

## Premise
- 完成原稿を取り込んだ後に自動整理する

## Arc Overview
### Beginning

### Middle

### Ending

## Structural Notes
- 本文の再創作は行わない
- 完成原稿を基準に章 > 話へ構造化する
`;
}

function buildCharactersTemplate() {
  return `# Characters

## Extraction Notes
- 完成原稿取込後に抽出する
- ここにある設定は画像生成の基準として扱う
- 自動抽出後も、ユーザ指定の見た目があれば優先して手動補正する
`;
}

function buildWorldTemplate() {
  return `# Worldbuilding

## Setting Summary
- 完成原稿取込後に主舞台と世界の前提を整理する

## Rules To Preserve
- 生活描写の温度感を壊さない
- 舞台や共同体の空気感を優先する
`;
}

function buildChapterOutlineTemplate() {
  return `# Chapter Outline

## Structure
- 正式単位: 章 > 話
- 章ごとに扉絵を 1 枚持つ
- 話ごとの挿絵は持たない

## Chapters
- 完成原稿取込後に生成する
`;
}

function buildStyleGuideTemplate() {
  return `# Style Guide

## Reading Experience
- スマホ縦読みを最優先する
- 背景は静かで、本文コントラストを落とさない
- 章扉絵は画像全体が見切れない表示を優先する

## Visual Direction
- 画像内に文字を入れない
- タイトル画像はネタバレを避ける
- 章扉絵は風景主体、必要時のみ小さく人物を置く

## UI Rules
- 構成は章 > 話
- 章 Synopsis や話要約は表示しない
`;
}

function buildChapterSummariesTemplate() {
  return `# Chapter Summaries

- 完成原稿取込後に生成する
- 抽出結果は確認用資料であり、Web UI の本文表示には出さない
`;
}

function buildManuscriptOverviewTemplate(options) {
  return `# Manuscript Overview

## Source Status
- 取込元予定: ${options.sourceDraft}
- 状態: 未取込

## Publication Pipeline
- 本文 Markdown 整形
- キャラクター設定抽出
- 章あらすじ生成
- キャラクター画像生成
- 章扉絵生成
- タイトル画像生成
- モバイル Web ビルド
`;
}

function buildFullNovelTemplate(options) {
  return `# ${options.title}

<!-- ${options.sourceDraft} に完成原稿を配置した後、node scripts/import-draft-manuscript.mjs ${options.sourceDraft} --title="${options.title}" を実行して上書きする -->
`;
}

function buildDraftReadmeTemplate(options) {
  return `# 草稿フォルダ

- 完成原稿は ${options.sourceDraft} に置く
- 原稿形式は、少なくとも章見出しと話見出しを含む Markdown を想定する
- 参照画像がある場合も、このフォルダに一緒に置いてよい
`;
}

function buildDraftTemplate(options) {
  return `# ${options.title}

ここに完成済み原稿を貼り付ける。

## 第一章　章タイトル

### 第一話　話タイトル

本文
`;
}

function buildCharacterPromptTemplate() {
  return {
    spec: {
      globalPrompt:
        "Create a premium vertical watercolor character portrait for a Japanese mobile web novel. Keep the tone literary, readable, and warm. Do not render any visible text, typography, title lettering, logo, watermark, signage, or symbols that read like writing inside the image.",
      globalNegativePrompt:
        "text, typography, letters, words, caption, title lettering, logo, watermark, split panel, extra limbs, distorted anatomy, flat generic fantasy poster",
      fixedWidth: 1080,
      fixedHeight: 1920,
      outputDir: "project/assets/characters",
      defaultModel: "gemini-3.1-flash-image-preview",
    },
    characters: [],
  };
}

function buildChapterCoverPromptTemplate() {
  return {
    spec: {
      globalPrompt:
        "Create a premium vertical watercolor chapter-frontispiece for a Japanese mobile web novel. Favor elegant scenic composition over poster-like action. Do not render any visible text, typography, title lettering, logo, watermark, signage, or symbols that read like writing inside the image.",
      globalNegativePrompt:
        "text, typography, letters, words, caption, title lettering, signage, logo, watermark, collage, crowded action montage, deformed anatomy, photorealistic rendering, hard cel shading",
      fixedWidth: 1440,
      fixedHeight: 1920,
      outputDir: "project/assets/chapters",
      defaultModel: "gemini-3.1-flash-image-preview",
    },
    chapters: [],
  };
}

function buildTitlePromptTemplate(options) {
  return {
    spec: {
      globalPrompt:
        "Create a premium vertical watercolor cover illustration for a Japanese mobile web novel. Keep the mood calm, inviting, literary, and softly magical. Do not render any visible text, typography, title lettering, logo, watermark, signage, or symbols that read like writing inside the image.",
      globalNegativePrompt:
        "text, typography, letters, title lettering, logo, watermark, busy collage, split panels, hard comic style, spoiler imagery, battle poster composition",
      fixedWidth: 1440,
      fixedHeight: 2304,
    },
    titleImage: {
      id: "title-cover",
      model: "gemini-3.1-flash-image-preview",
      outputDir: "project/assets/title",
      referenceImages: [],
      prompt: `${options.title} の世界観を象徴する縦長の装画。ネタバレは避け、物語全体の空気だけを伝える。`,
      negativePrompt:
        "avoid action-heavy battle poster composition, avoid late-story revelations, and avoid any visible text inside the illustration",
    },
  };
}

function scaffoldEntries(options) {
  return [
    ["草稿/README.md", buildDraftReadmeTemplate(options)],
    ["草稿/初稿.md", buildDraftTemplate(options)],
    ["project/00_project_overview.md", buildOverviewTemplate(options)],
    ["project/01_plot.md", buildPlotTemplate()],
    ["project/02_characters.md", buildCharactersTemplate()],
    ["project/03_worldbuilding.md", buildWorldTemplate()],
    ["project/04_chapter_outline.md", buildChapterOutlineTemplate()],
    ["project/05_style_guide.md", buildStyleGuideTemplate()],
    ["project/06_chapter_summaries.md", buildChapterSummariesTemplate()],
    ["project/manuscript/00_manuscript_overview.md", buildManuscriptOverviewTemplate(options)],
    ["project/manuscript/full_novel.md", buildFullNovelTemplate(options)],
    ["prompts/character-portraits.json", `${JSON.stringify(buildCharacterPromptTemplate(), null, 2)}\n`],
    ["prompts/chapter-cover-images.json", `${JSON.stringify(buildChapterCoverPromptTemplate(), null, 2)}\n`],
    ["prompts/title-image.json", `${JSON.stringify(buildTitlePromptTemplate(options), null, 2)}\n`],
    ["docs/.nojekyll", ""],
  ];
}

async function ensureWorkspaceDirectories() {
  await Promise.all([
    ensureDir(path.join(rootDir, "草稿")),
    ensureDir(path.join(rootDir, "project", "manuscript")),
    ensureDir(path.join(rootDir, "project", "assets", "characters")),
    ensureDir(path.join(rootDir, "project", "assets", "chapters")),
    ensureDir(path.join(rootDir, "project", "assets", "title")),
    ensureDir(path.join(rootDir, "project", "assets", "ui")),
    ensureDir(path.join(rootDir, "prompts")),
    ensureDir(path.join(rootDir, "docs")),
  ]);
}

export async function scaffoldProject(options, config = {}) {
  const dryRun = Boolean(config.dryRun);
  const assumeMissing = Boolean(config.assumeMissing);
  if (!dryRun) {
    await ensureWorkspaceDirectories();
  }

  const created = [];
  const skipped = [];

  for (const [relativePath, content] of scaffoldEntries(options)) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!assumeMissing && (await exists(absolutePath))) {
      skipped.push(relativePath);
      continue;
    }

    if (!dryRun) {
      await ensureDir(path.dirname(absolutePath));
      await writeFile(absolutePath, content, "utf8");
    }
    created.push(relativePath);
  }

  return { created, skipped };
}

async function main() {
  const options = parseArgs(process.argv);

  process.stdout.write(
    `Retained infrastructure:\n- ${RETAINED_INFRA_PATHS.join("\n- ")}\n\nMinimal scaffold:\n- ${MINIMAL_SCAFFOLD_PATHS.join("\n- ")}\n\n`,
  );

  const result = await scaffoldProject(options, { dryRun: options.dryRun });
  const headline = options.dryRun ? "Dry run only. No files were written." : "Project scaffold initialized.";

  process.stdout.write(`${headline}\n`);
  if (result.created.length > 0) {
    process.stdout.write(`Created ${result.created.length} files:\n- ${result.created.join("\n- ")}\n`);
  }
  if (result.skipped.length > 0) {
    process.stdout.write(`Skipped existing ${result.skipped.length} files.\n`);
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
