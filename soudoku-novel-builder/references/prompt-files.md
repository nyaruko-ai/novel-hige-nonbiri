# Prompt Files

## `prompts/character-portraits.json`

```json
{
  "spec": {
    "globalPrompt": "overall portrait direction",
    "globalNegativePrompt": "things to avoid",
    "fixedWidth": 1080,
    "fixedHeight": 1920,
    "outputDir": "project/assets/characters",
    "defaultModel": "gemini-3.1-flash-image-preview"
  },
  "characters": [
    {
      "id": "sato",
      "name": "サトー",
      "model": "gemini-3.1-flash-image-preview",
      "prompt": "portrait direction",
      "negativePrompt": "portrait-specific avoidance",
      "referenceImage": "草稿/example.png",
      "sourceRefs": [
        "草稿/初稿.md",
        "project/02_characters.md"
      ]
    }
  ]
}
```

## `prompts/chapter-cover-images.json`

```json
{
  "spec": {
    "globalPrompt": "overall frontispiece direction",
    "globalNegativePrompt": "things to avoid",
    "fixedWidth": 1440,
    "fixedHeight": 1920,
    "outputDir": "project/assets/chapters",
    "defaultModel": "gemini-3.1-flash-image-preview"
  },
  "chapters": [
    {
      "id": "chapter-001",
      "chapterLabel": "第一章",
      "chapterTitle": "第一章　静かじゃなくなったミルフィ村と、樹海への引っ越し",
      "mood": "sunrise",
      "model": "gemini-3.1-flash-image-preview",
      "referenceCharacterIds": [
        "sato",
        "nyaruko"
      ],
      "referenceImages": [
        "project/assets/characters/sato.png",
        "project/assets/characters/nyaruko.png"
      ],
      "prompt": "chapter-specific direction",
      "negativePrompt": "cover-specific avoidance"
    }
  ]
}
```

## `prompts/title-image.json`

```json
{
  "spec": {
    "globalPrompt": "overall cover direction",
    "globalNegativePrompt": "things to avoid",
    "fixedWidth": 1440,
    "fixedHeight": 2304
  },
  "titleImage": {
    "id": "title-cover",
    "model": "gemini-3.1-flash-image-preview",
    "outputDir": "project/assets/title",
    "referenceImages": [],
    "prompt": "title-cover-specific direction",
    "negativePrompt": "title-cover-specific avoidance"
  }
}
```

## Usage Notes

- キャラクター画像は本文から抽出した設定に従う
- 章扉絵は章全体の空気感を担い、話ごとの挿絵にはしない
- `project/assets/ui/` は prompt ではなくローカル生成素材として扱う
- 画像生成 API が使えない場合、生成スクリプトはローカルフォールバック画像を出力する
- すべての prompt で、画像内文字を禁止する。`text`, `typography`, `letters`, `logo`, `watermark`, `caption`, `title lettering` などを `globalNegativePrompt` に入れる。
- タイトル画像はネタバレ禁止。後半の敵対、決戦、正体暴露、巨大クリーチャー中心構図を避ける。
- 章扉絵は風景主体を基本にし、キャラクターを入れる場合は小さめに配置する。
- キャラクター整合性が重要な章扉絵では `referenceCharacterIds` と `referenceImages` を併用する。
- 参照画像やユーザ指定があるキャラクターは、自動抽出結果よりもその指定を優先する。
