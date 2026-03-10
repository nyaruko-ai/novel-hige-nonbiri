# novel-hige-nonbiri

完成済み原稿を、キャラクター画像・章扉絵・タイトル画像つきのモバイル Web 小説へ変換するための作業リポジトリです。  
中心スキルは `soudoku-novel-builder/SKILL.md` です。

## 何をするリポジトリか

- 入力は完成済みの Markdown 原稿
- 構成単位は `章 > 話`
- 原稿からキャラクター設定を抽出する
- 章扉絵、キャラクター画像、タイトル画像を生成する
- モバイル Web Reader として `docs/` にビルドする

## 基本ワークフロー

1. 完成原稿を `草稿/初稿.md` に置く
2. 原稿を `project/` に取り込む
3. キャラクター抽出と章要約を作る
4. 画像を生成する
5. Web Reader を `docs/` にビルドする

代表コマンド:

```bash
node scripts/import-draft-manuscript.mjs 草稿/初稿.md --title="作品名"
node scripts/extract-characters-from-draft.mjs
node scripts/build-chapter-summaries.mjs
node scripts/generate-ui-textures.mjs
node scripts/generate-character-portrait.mjs --all
node scripts/generate-chapter-cover.mjs --all
node scripts/generate-title-image.mjs
node scripts/build-web-novel.mjs
node scripts/check-project-state.mjs
```

`package.json` にも主要スクリプトを登録しています。

## 画像ルール

- キャラクター画像、章扉絵、タイトル画像のすべてで画像内文字を禁止する
- 題字、看板、ロゴ、透かし、キャプション、読める記号は入れない
- タイトル画像はネタバレ禁止
- 章扉絵は風景主体を優先し、人物は必要時のみ小さく入れる
- 章扉絵は必要に応じてキャラクター参照画像で整合性を取る

## 最小保持ファイル

初期化・リセット後も残す前提の最小インフラは次です。

- `.env`
- `.env.example`
- `.gitignore`
- `AGENTS.md`
- `README.md`
- `package.json`
- `package-lock.json`
- `scripts/`
- `soudoku-novel-builder/`

## 再生成される最小スキャフォールド

`init:project` または `reset:project` 実行後に作られる最小作業ファイルです。

- `草稿/README.md`
- `草稿/初稿.md`
- `project/00_project_overview.md`
- `project/01_plot.md`
- `project/02_characters.md`
- `project/03_worldbuilding.md`
- `project/04_chapter_outline.md`
- `project/05_style_guide.md`
- `project/06_chapter_summaries.md`
- `project/manuscript/00_manuscript_overview.md`
- `project/manuscript/full_novel.md`
- `prompts/character-portraits.json`
- `prompts/chapter-cover-images.json`
- `prompts/title-image.json`
- `docs/.nojekyll`

## 初期化とリセット

空の新規作業状態を作る:

```bash
npm run init:project -- --title="新しい作品名" --subtitle="副題"
```

既存の小説作業物を消して、スキルとインフラだけ残して再初期化する:

```bash
npm run reset:project -- --title="新しい作品名" --subtitle="副題"
```

どちらのスクリプトも `--dry-run` を付けると、何を残し何を作るかだけ確認できます。

```bash
npm run reset:project -- --dry-run
```

## リセット対象

`reset:project` は次の作業物を削除して作り直します。

- `docs/`
- `project/`
- `prompts/`
- `草稿/`

つまり、生成済み Web 出力、抽出結果、画像定義、草稿はすべて新規作業向けに空へ戻ります。
