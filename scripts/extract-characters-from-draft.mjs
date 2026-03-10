import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStructuredMarkdown, stripLeadingLabel, truncateText } from "./lib/complete-draft.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const manuscriptPath = path.join(rootDir, "project", "manuscript", "full_novel.md");
const outputCharactersPath = path.join(rootDir, "project", "02_characters.md");
const outputPromptsPath = path.join(rootDir, "prompts", "character-portraits.json");

const candidatePattern = /([一-龠々ぁ-ゖァ-ヶー]{2,12})(?:殿|様|さん|が|は|を|に|へ|と|も|の|、|。|」)/g;
const stopwords = new Set([
  "第一章",
  "第二章",
  "第三章",
  "第四章",
  "第五章",
  "第六章",
  "第七章",
  "第八章",
  "第九章",
  "第十章",
  "第一話",
  "第二話",
  "第三話",
  "第四話",
  "第五話",
  "第六話",
  "第七話",
  "第八話",
  "第九話",
  "第十話",
  "王都",
  "王国",
  "帝国",
  "連合国",
  "樹海",
  "盆地",
  "村",
  "生活",
  "開拓",
  "話",
  "章",
  "風",
  "夜",
  "朝",
  "道",
  "家",
  "人",
  "場所",
  "相手",
  "手紙",
  "書簡",
  "商人",
  "学者",
  "役人",
  "書記官",
  "村人",
  "冒険者",
  "ギルド",
  "灰鐘院",
  "特務調査局",
  "ご主人様",
  "主人公",
  "相変わらず",
  "そのとき",
  "その日",
  "翌日",
  "ようやく",
  "本当に",
  "便利",
  "平和",
  "引っ越し",
  "のんびり",
  "暮らし",
  "最初",
  "最後",
]);

const knownIds = {
  サトー: "sato",
  ニャル子: "nyaruko",
  しろたま: "shirotama",
  セレスティア: "celestia",
  ペリック: "perick",
  バルド: "baldo",
  ミレナ: "milena",
  ハイル: "heil",
  ユルナ: "yurna",
  レギウス: "regius",
  ヴェルグラン: "velgrang",
  村長: "village-chief",
};

const priorityNames = [
  "サトー",
  "ニャル子",
  "しろたま",
  "セレスティア",
  "ペリック",
  "バルド",
  "ミレナ",
  "ハイル",
  "ユルナ",
  "レギウス",
  "ヴェルグラン",
  "村長",
];

const manualProfiles = {
  サトー: {
    role: "主人公 / ヒゲ魔法で暮らしを切り開く開拓者",
    appearance:
      "四十歳。長い髪を後ろで束ね、立派なヒゲを持つ。戦うより生活の役に立つ形で力を使う。",
    speech: "戦うよりこういう使い方のほうが好きなんだよ、俺は",
    relations: ["ニャル子", "しろたま", "セレスティア"],
  },
  ニャル子: {
    role: "相棒 / 猫耳メイドの生活設計役",
    appearance:
      "銀髪のボブカットで、琥珀色の目を持つ猫耳メイド。黒と白を基調にした上品なメイド服を着て、首元の金の鈴が印象的。感情が耳に出やすく、てきぱきと家事と段取りを回す。",
    speech: "ご主人様のヒゲ、もはや便利道具箱ですにゃ",
    relations: ["サトー", "しろたま"],
  },
  しろたま: {
    role: "相棒 / 白いもふもふの感応役",
    appearance:
      "猫ではなく、顔と胴体が完全に一体になった白くてまん丸い毛玉のような小さな生き物。小さな耳とつぶらな黒い目と短い尻尾があり、手足は見えない。首輪や服や装飾品は付けず、異世界の遺跡や樹海にもなじむ神秘的な雰囲気を持つ。白いもふもふの体で丸くなって眠ることが多いが、樹海の異変には鋭く反応する。",
    speech: "モフ",
    relations: ["サトー", "ニャル子"],
  },
  セレスティア: {
    role: "王国側の窓口 / 真面目で現実的な調整役",
    appearance: "濃紺の外套をまとい、背筋を伸ばした隙のない佇まい。",
    relations: ["サトー", "ニャル子", "村長"],
  },
  ペリック: {
    role: "行商人 / 軽薄そうで土地勘のあるトリックスター",
    appearance: "荷車と一緒に騒がしく現れ、口が回る。",
    relations: ["サトー", "ニャル子", "バルド"],
  },
  バルド: {
    role: "元補給官 / 工房と物流を整える実務家",
    appearance: "斧より帳面が得意で、工房と倉庫を仕切る現場の要。",
    relations: ["サトー", "ミレナ", "ハイル"],
  },
  ミレナ: {
    role: "治療師 / 土と生活改善を見る実務家",
    appearance: "診療だけでなく畑や保存食の整備まで視野に入れる。",
    relations: ["サトー", "バルド", "ペリック"],
  },
  ハイル: {
    role: "帝国工兵 / 橋や導流路を担う土木の専門家",
    appearance: "理屈が立ち、構造物と排水を実務で回す。",
    relations: ["サトー", "バルド"],
  },
  ユルナ: {
    role: "森辺の狩人 / 樹海の掟と古い語りを知る案内役",
    appearance: "樹海の境を知る静かな観察者。",
    relations: ["サトー", "ニャル子", "ヴェルグラン"],
  },
  レギウス: {
    role: "禁書を持ち込む研究者",
    appearance: "禁書と知識を携えて現れる。",
    relations: ["サトー", "ユルナ"],
  },
  ヴェルグラン: {
    role: "白角の境主 / 樹海の深層を象徴する存在",
    appearance: "白角と圧倒的な気配を持つ樹海の主。",
    relations: ["サトー", "ニャル子", "しろたま"],
  },
  村長: {
    role: "ミルフィ村の村長",
    appearance: "村の現実と情を背負ってサトーを送り出す。",
    relations: ["サトー", "セレスティア"],
  },
};

const referenceImages = {
  しろたま: "草稿/shirotama.png",
  村長: "草稿/village-chief.png",
};

const appearanceKeywords = ["髪", "耳", "目", "顔", "顎", "ヒゲ", "髭", "外套", "法衣", "革鎧", "旅装", "鈴", "尻尾", "白い", "長い", "姿"];
const roleKeywords = ["村長", "治療師", "行商", "補給官", "工兵", "狩人", "局", "学者", "商人", "役人", "猫", "殿", "様", "主人", "教官"];
const speechKeywords = ["「", "」"];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeToken(value) {
  return String(value || "").trim();
}

function looksLikeCandidate(token) {
  if (!token || stopwords.has(token)) {
    return false;
  }

  if (/^第[一二三四五六七八九十百千万〇零]+[章話]$/.test(token)) {
    return false;
  }

  if (token.length < 2 || token.length > 12) {
    return false;
  }

  return /[ぁ-ゖァ-ヶー一-龠々]/.test(token);
}

function collectCandidateScores(text, titles) {
  const scores = new Map();

  for (const title of titles) {
    for (const part of title.split(/[　 、・,]/).map(normalizeToken)) {
      if (!looksLikeCandidate(part)) {
        continue;
      }
      scores.set(part, (scores.get(part) || 0) + 2);
    }
  }

  for (const match of text.matchAll(candidatePattern)) {
    const token = normalizeToken(match[1]);
    if (!looksLikeCandidate(token)) {
      continue;
    }
    scores.set(token, (scores.get(token) || 0) + 1);
  }

  return [...scores.entries()]
    .filter(([, score]) => score >= 4)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"));
}

function paragraphCorpus(novel) {
  return novel.chapters.flatMap((chapter) =>
    chapter.talks.flatMap((talk) =>
      talk.paragraphs.map((paragraph) => ({
        chapter,
        talk,
        paragraph,
      })),
    ),
  );
}

function pickContexts(entries, name, keywords, limit = 2) {
  return entries
    .filter((entry) => entry.paragraph.includes(name) && keywords.some((keyword) => entry.paragraph.includes(keyword)))
    .slice(0, limit)
    .map((entry) => truncateText(entry.paragraph, 110));
}

function pickAppearance(entries, name, limit = 2) {
  const direct = pickContexts(entries, name, appearanceKeywords, limit);
  if (direct.length >= limit) {
    return direct;
  }

  const firstIndex = entries.findIndex((entry) => entry.paragraph.includes(name));
  if (firstIndex === -1) {
    return direct;
  }

  const fallback = [];
  for (let index = firstIndex; index < Math.min(entries.length, firstIndex + 4); index += 1) {
    const entry = entries[index];
    if (!appearanceKeywords.some((keyword) => entry.paragraph.includes(keyword))) {
      continue;
    }
    fallback.push(truncateText(entry.paragraph, 110));
    if (fallback.length >= limit) {
      break;
    }
  }

  return [...direct, ...fallback].filter((value, index, array) => array.indexOf(value) === index).slice(0, limit);
}

function pickSpeech(entries, name) {
  const speechEntry = entries.find(
    (entry) => entry.paragraph.includes(name) && speechKeywords.every((keyword) => entry.paragraph.includes(keyword)),
  );
  if (speechEntry) {
    return truncateText(speechEntry.paragraph, 100);
  }

  return "";
}

function extractRoleFromTitles(name, titles) {
  const pattern = new RegExp(`([一-龠々ぁ-ゖァ-ヶー]{1,12})${escapeRegExp(name)}`);
  for (const title of titles) {
    const body = title.replace(/^第[一二三四五六七八九十百千万〇零]+[章話][ 　]*/, "");
    const match = body.match(pattern);
    if (
      match &&
      match[1] &&
      match[1] !== name &&
      !["かけたくない", "最初から怪しい", "最初の", "余計な", "白い角の", "最奥への"].includes(match[1])
    ) {
      return match[1];
    }
  }
  return "";
}

function findRelations(entries, name, names) {
  const related = new Map();

  for (const entry of entries.filter((item) => item.paragraph.includes(name))) {
    for (const candidate of names) {
      if (candidate === name || !entry.paragraph.includes(candidate)) {
        continue;
      }
      related.set(candidate, (related.get(candidate) || 0) + 1);
    }
  }

  return [...related.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([candidate]) => candidate);
}

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function buildCharacterMarkdown(characters) {
  const blocks = [
    "# Characters",
    "",
    "## Extraction Notes",
    "- 完成原稿の頻度、見出し、周辺描写から主要人物を抽出",
    "- ここにある設定は草稿からの一次抽出で、画像生成前提の要約を含む",
  ];

  for (const character of characters) {
    blocks.push("");
    blocks.push(`### character_id: ${character.id}`);
    blocks.push(`- 名前: ${character.name}`);
    blocks.push(`- 役割: ${character.role || "本文から追加確認"}`);
    blocks.push(`- 外見: ${character.appearance.length > 0 ? character.appearance.join(" / ") : "本文から追加確認"}`);
    blocks.push(`- 話し方: ${character.speech || "本文から追加確認"}`);
    blocks.push(`- 関係: ${character.relations.length > 0 ? character.relations.join("、") : "本文から追加確認"}`);
    blocks.push(`- 初出印象: ${character.impression}`);
    if (character.referenceImage) {
      blocks.push(`- 参照画像: ${character.referenceImage}`);
    }
    blocks.push(`- 画像プロンプト要約: ${character.promptSummary}`);
  }

  return `${blocks.join("\n")}\n`;
}

function buildPromptFile(characters) {
  return {
    spec: {
      globalPrompt:
        "Create a premium vertical watercolor character portrait for a Japanese mobile web novel. Use layered washes, soft edge control, luminous paper texture, and painterly detail while keeping face, silhouette, costume, and signature props readable. Do not render any visible text, typography, signage, caption, letters, runes, or title elements inside the image.",
      globalNegativePrompt:
        "text, typography, letters, words, caption, title, signage, logo, watermark, split panel, extra limbs, distorted anatomy, flat generic fantasy poster, photorealistic rendering, hard cel shading",
      fixedWidth: 1080,
      fixedHeight: 1920,
      outputDir: "project/assets/characters",
      defaultModel: "gemini-3.1-flash-image-preview",
    },
    characters: characters.map((character) => ({
      id: character.id,
      name: character.name,
      model: "gemini-3.1-flash-image-preview",
      prompt: character.promptSummary,
      negativePrompt:
        character.id === "nyaruko"
          ? "avoid costume drift, do not remove the black-and-white maid outfit, and do not change silver bob hair or amber eyes"
          : character.id === "shirotama"
            ? "do not turn it into a cat, dog, fox, mascot, or realistic quadruped; no collar, no ribbon, no clothes, no accessories; preserve a single perfectly round fluffy body with the face embedded into the sphere, tiny ears, tiny tail, no visible limbs, and simple dark eyes; keep an otherworldly fantasy atmosphere"
            : "avoid costume drift and avoid changing signature physical cues",
      referenceImage: character.referenceImage || undefined,
      sourceRefs: ["草稿/初稿.md", "project/02_characters.md"],
    })),
  };
}

async function main() {
  const manuscriptSource = await readFile(manuscriptPath, "utf8");
  const novel = parseStructuredMarkdown(manuscriptSource);
  const entries = paragraphCorpus(novel);
  const titles = novel.chapters.flatMap((chapter) => [
    chapter.fullTitle,
    ...chapter.talks.map((talk) => talk.fullTitle),
  ]);
  const fullText = entries.map((entry) => entry.paragraph).join("\n");

  const scoredCandidates = collectCandidateScores(fullText, titles);
  const names = [
    ...priorityNames.filter((name) => fullText.includes(name) || titles.some((title) => title.includes(name))),
    ...scoredCandidates
    .map(([name]) => name)
    .filter((name) => {
      const hasTitleHit = titles.some((title) => title.includes(name));
      const paragraphHits = entries.filter((entry) => entry.paragraph.includes(name)).length;
      return hasTitleHit || paragraphHits >= 5;
    })
    .filter((name) => !priorityNames.includes(name)),
  ]
    .slice(0, 12);

  const characters = [];

  for (const [index, name] of names.entries()) {
    const manual = manualProfiles[name] || {};
    const titleRole = extractRoleFromTitles(name, titles);
    const appearance = [
      ...(manual.appearance ? [manual.appearance] : []),
      ...pickAppearance(entries, name, 2),
    ]
      .filter(Boolean)
      .slice(0, 2);
    const roleContexts = pickContexts(entries, name, roleKeywords, 1);
    const speech = manual.speech || pickSpeech(entries, name);
    const impressionEntry = entries.find((entry) => entry.paragraph.includes(name));
    const relations = manual.relations || findRelations(entries, name, names);
    const promptParts = [
      `${name} の縦長キャラクターポートレート。`,
      manual.role || titleRole ? `役割は ${manual.role || titleRole}。` : "",
      appearance.length > 0 ? `外見の手掛かり: ${appearance.join(" ")}` : "",
      speech ? `話し方の印象: ${speech}` : "",
      relations.length > 0 ? `関係性の中心には ${relations.join("、")} がいる。` : "",
      "生活感と物語の温度を優先し、過剰に戦闘的な構図にしない。",
    ]
      .filter(Boolean)
      .join(" ");

    const referenceImage = referenceImages[name];
    const normalizedReferenceImage =
      referenceImage && (await exists(path.join(rootDir, referenceImage))) ? referenceImage : "";

    characters.push({
      id: knownIds[name] || `character-${String(index + 1).padStart(3, "0")}`,
      name,
      role: manual.role || titleRole || roleContexts[0] || "",
      appearance,
      speech,
      relations,
      impression: truncateText(impressionEntry?.paragraph || `${name} が物語に登場する。`, 110),
      promptSummary: truncateText(promptParts, 320),
      referenceImage: normalizedReferenceImage,
    });
  }

  await Promise.all([
    writeFile(outputCharactersPath, buildCharacterMarkdown(characters), "utf8"),
    writeFile(outputPromptsPath, `${JSON.stringify(buildPromptFile(characters), null, 2)}\n`, "utf8"),
  ]);

  process.stdout.write(`Extracted ${characters.length} character profiles\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
