---
name: soudoku-novel-builder
description: Use this skill to transform a completed draft manuscript into a structured mobile web novel with extracted character profiles, chapter summaries, chapter frontispieces, and a reader-friendly UI.
---

# Soudoku Novel Builder

完成済み原稿を、スマホで読める Web 小説へ整えるための制作スキル。新規執筆よりも、原稿の構造化、抽出、画像生成、読書体験の設計を主目的にする。

## First Moves

1. 完成原稿の所在を確認する。既定入力は `草稿/初稿.md`。
2. `node scripts/import-draft-manuscript.mjs 草稿/初稿.md --title="..."` を実行し、`project/manuscript/full_novel.md` と `project/04_chapter_outline.md` を作る。
3. `node scripts/extract-characters-from-draft.mjs` を実行して、`project/02_characters.md` と `prompts/character-portraits.json` を生成する。
4. `node scripts/build-chapter-summaries.mjs` を実行して、`project/06_chapter_summaries.md` と `prompts/chapter-cover-images.json` を生成する。
5. `node scripts/generate-ui-textures.mjs` を実行して、読書背景用の UI 素材を作る。
6. ここまでで一度、抽出された章構造、キャラクター設定、章あらすじをユーザ確認へ出す。

## Composition Model

このスキルの正式構成単位は `章 > 話`。

### 章

- 章は大きな転換点と読書体験の区切り
- 章ごとに扉絵を 1 枚持つ
- 章ごとにあらすじを持つ
- 章メニューの主要ナビゲーション単位

### 話

- 話は本文表示の単位
- 1 話は 1 つの読み切り感を保つ
- 話ごとに本文をそのまま流し、場面ごとの画像は持たせない

### 補助概念

- `節` は必要なら内部的に分析補助として扱ってよい
- ただし、本文、画像、UI の必須単位にはしない

## Working Rules

- 完成原稿の内容を先に尊重する。勝手に再構成や加筆をしない。
- 正本は `project/` 配下。抽出結果や整形結果はここに置く。
- 章・話の順序は原稿からそのまま引き継ぐ。
- 画像は `キャラクター画像` と `章扉絵` に絞る。
- Web UI は `章 > 話` ベースで構築し、話ごとの画像差し込みは行わない。
- 背景は静かな SVG / CSS 表現を使い、本文の可読性を最優先する。
- 画像生成 API が使えない場合でも、ローカル生成フォールバックで成果物を欠かさない。

## Standard Loop

### 1. 原稿取込

- `references/project-files.md` を必要部分だけ確認する。
- `import-draft-manuscript.mjs` で完成原稿を `project/` へ正規化する。
- `project/manuscript/full_novel.md` は `## 章`, `### 話` の形式で保持する。

### 2. 抽出

- `extract-characters-from-draft.mjs` で主要人物を抽出する。
- `build-chapter-summaries.mjs` で章あらすじを作る。
- 抽出結果は `project/02_characters.md` と `project/06_chapter_summaries.md` に置く。

### 3. 画像定義

- キャラクター画像定義は `prompts/character-portraits.json`
- 章扉絵定義は `prompts/chapter-cover-images.json`
- UI 背景素材は `project/assets/ui/`

### 4. 画像生成

- `node scripts/generate-character-portrait.mjs --all`
- `node scripts/generate-chapter-cover.mjs --all`
- API が使えない場合はローカルフォールバック生成を使う

### 5. Web ビルド

- `node scripts/build-web-novel.mjs`
- 出力は `docs/`
- 表示構成は `タイトル -> 章扉絵 -> 章あらすじ -> 各話本文`

### 6. 整合性確認

- `node scripts/check-project-state.mjs`
- 章数、話数、キャラクター抽出、章あらすじ、扉絵、UI 素材、Web ビルドを確認する

## Commands

- 原稿取込: `node scripts/import-draft-manuscript.mjs 草稿/初稿.md --title="作品名"`
- キャラクター抽出: `node scripts/extract-characters-from-draft.mjs`
- 章あらすじ生成: `node scripts/build-chapter-summaries.mjs`
- キャラクター画像生成: `node scripts/generate-character-portrait.mjs <character-id|--all> [reference-image-path] [--parallel=2]`
- 章扉絵生成: `node scripts/generate-chapter-cover.mjs <chapter-id|--all> [--parallel=2]`
- UI 背景素材生成: `node scripts/generate-ui-textures.mjs`
- Web ビルド: `node scripts/build-web-novel.mjs`
- 状態確認: `node scripts/check-project-state.mjs`

## Read As Needed

- ファイル役割は `references/project-files.md`
- prompt JSON の形式は `references/prompt-files.md`

このスキルの目的は、完成原稿を「読みやすく、見やすく、画像付きでスマホに届けられる状態」へ変換すること。
