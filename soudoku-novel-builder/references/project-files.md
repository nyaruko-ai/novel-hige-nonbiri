# Project Files

## Canon Files

- `project/00_project_overview.md`: 入力原稿、作品情報、今回の整備方針
- `project/01_plot.md`: 完成原稿を俯瞰した高レベルの流れ
- `project/02_characters.md`: 本文から抽出した主要キャラクター設定
- `project/03_worldbuilding.md`: 舞台や世界の保持すべき要素
- `project/04_chapter_outline.md`: `章 > 話` 構造の正規化結果
- `project/05_style_guide.md`: 読書体験、UI、画像トーン
- `project/06_chapter_summaries.md`: 章ごとのあらすじ
- `project/manuscript/00_manuscript_overview.md`: 取込済み本文の状態
- `project/manuscript/full_novel.md`: Web ビルドの基準本文。形式は `## 章`, `### 話`

## Asset and Build Files

- `prompts/character-portraits.json`: キャラクター画像生成定義
- `prompts/chapter-cover-images.json`: 章扉絵生成定義
- `prompts/title-image.json`: 必要なら装画に使う定義
- `project/assets/characters/`: キャラクター画像
- `project/assets/chapters/`: 章扉絵
- `project/assets/title/`: タイトル画像
- `project/assets/ui/`: 読書背景や UI 素材
- `docs/`: 配信用静的 Web 出力

## Update Order

1. 完成原稿を `import-draft-manuscript.mjs` で `project/` に取り込む
2. `extract-characters-from-draft.mjs` で `project/02_characters.md` と `prompts/character-portraits.json` を作る
3. `build-chapter-summaries.mjs` で `project/06_chapter_summaries.md` と `prompts/chapter-cover-images.json` を作る
4. `generate-ui-textures.mjs` で背景素材を作る
5. キャラクター画像と章扉絵を生成する
6. `build-web-novel.mjs` で `docs/` をビルドする

## Change Guardrails

- 原稿の章順、話順、本文内容を勝手に並べ替えない
- 本文は `章 > 話` の構造を崩さない
- 話ごとに画像を差し込まない
- 章扉絵は章ごとに 1 枚
- 背景は本文可読性を損なわないこと
- 画像生成 API が使えなくても、ローカルフォールバックで成果物を途切れさせない
