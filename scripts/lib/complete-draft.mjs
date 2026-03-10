const chapterPattern = /^第([一二三四五六七八九十百千万〇零]+)章[ 　]+(.+)$/;
const talkPattern = /^第([一二三四五六七八九十百千万〇零]+)話[ 　]+(.+)$/;

export function chapterId(index) {
  return `chapter-${String(index).padStart(3, "0")}`;
}

export function talkId(chapterIndex, talkIndex) {
  return `talk-${String(chapterIndex).padStart(3, "0")}-${String(talkIndex).padStart(3, "0")}`;
}

export function stripLeadingLabel(title, label) {
  if (typeof title !== "string" || !title) {
    return "";
  }

  if (!label || !title.startsWith(label)) {
    return title.trim();
  }

  return title.slice(label.length).replace(/^[\s　]+/, "").trim() || title.trim();
}

function normalizeParagraph(buffer) {
  const lines = buffer.map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return "";
  }

  const keepLineBreaks =
    lines.length > 1 &&
    lines.every((line) => /^(?:――|—)/.test(line));

  return lines.join(keepLineBreaks ? "\n" : "").trim();
}

function flushParagraph(targetTalk, paragraphBuffer) {
  if (!targetTalk || paragraphBuffer.length === 0) {
    return [];
  }

  const paragraph = normalizeParagraph(paragraphBuffer);
  if (paragraph) {
    targetTalk.paragraphs.push(paragraph);
  }

  return [];
}

export function parseDraftManuscript(source, options = {}) {
  const fallbackTitle = options.title || "Web Novel";
  const lines = source.split(/\r?\n/);
  const chapters = [];
  let currentChapter = null;
  let currentTalk = null;
  let paragraphBuffer = [];
  let talkGlobalIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const chapterMatch = line.match(chapterPattern);
    const talkMatch = line.match(talkPattern);

    if (chapterMatch) {
      paragraphBuffer = flushParagraph(currentTalk, paragraphBuffer);
      currentTalk = null;

      const chapterIndex = chapters.length + 1;
      currentChapter = {
        id: chapterId(chapterIndex),
        index: chapterIndex,
        label: `第${chapterMatch[1]}章`,
        fullTitle: line.trim(),
        title: chapterMatch[2].trim(),
        talks: [],
      };
      chapters.push(currentChapter);
      continue;
    }

    if (talkMatch) {
      paragraphBuffer = flushParagraph(currentTalk, paragraphBuffer);

      if (!currentChapter) {
        const chapterIndex = chapters.length + 1;
        currentChapter = {
          id: chapterId(chapterIndex),
          index: chapterIndex,
          label: `第${chapterIndex}章`,
          fullTitle: `第${chapterIndex}章`,
          title: `第${chapterIndex}章`,
          talks: [],
        };
        chapters.push(currentChapter);
      }

      const talkIndex = currentChapter.talks.length + 1;
      talkGlobalIndex += 1;
      currentTalk = {
        id: talkId(currentChapter.index, talkIndex),
        index: talkIndex,
        globalIndex: talkGlobalIndex,
        label: `第${talkMatch[1]}話`,
        fullTitle: line.trim(),
        title: talkMatch[2].trim(),
        paragraphs: [],
      };
      currentChapter.talks.push(currentTalk);
      continue;
    }

    if (!currentTalk) {
      continue;
    }

    if (line.trim() === "") {
      paragraphBuffer = flushParagraph(currentTalk, paragraphBuffer);
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph(currentTalk, paragraphBuffer);

  return {
    title: fallbackTitle,
    chapters,
    chapterCount: chapters.length,
    talkCount: chapters.reduce((sum, chapter) => sum + chapter.talks.length, 0),
    paragraphCount: chapters.reduce(
      (sum, chapter) => sum + chapter.talks.reduce((inner, talk) => inner + talk.paragraphs.length, 0),
      0,
    ),
  };
}

export function parseStructuredMarkdown(source, options = {}) {
  const lines = source.split(/\r?\n/);
  let title = options.title || "Web Novel";
  const chapters = [];
  let currentChapter = null;
  let currentTalk = null;
  let paragraphBuffer = [];
  let talkGlobalIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("# ")) {
      title = line.replace(/^#\s+/, "").trim() || title;
      continue;
    }

    if (line.startsWith("## ")) {
      paragraphBuffer = flushParagraph(currentTalk, paragraphBuffer);
      currentTalk = null;

      const fullTitle = line.replace(/^##\s+/, "").trim();
      const chapterIndex = chapters.length + 1;
      const labelMatch = fullTitle.match(/^(第[一二三四五六七八九十百千万〇零]+章)/);
      currentChapter = {
        id: chapterId(chapterIndex),
        index: chapterIndex,
        label: labelMatch ? labelMatch[1] : `第${chapterIndex}章`,
        fullTitle,
        title: stripLeadingLabel(fullTitle, labelMatch ? labelMatch[1] : ""),
        talks: [],
      };
      chapters.push(currentChapter);
      continue;
    }

    if (line.startsWith("### ")) {
      paragraphBuffer = flushParagraph(currentTalk, paragraphBuffer);

      if (!currentChapter) {
        const chapterIndex = chapters.length + 1;
        currentChapter = {
          id: chapterId(chapterIndex),
          index: chapterIndex,
          label: `第${chapterIndex}章`,
          fullTitle: `第${chapterIndex}章`,
          title: `第${chapterIndex}章`,
          talks: [],
        };
        chapters.push(currentChapter);
      }

      const fullTitle = line.replace(/^###\s+/, "").trim();
      const talkIndex = currentChapter.talks.length + 1;
      talkGlobalIndex += 1;
      const labelMatch = fullTitle.match(/^(第[一二三四五六七八九十百千万〇零]+話)/);
      currentTalk = {
        id: talkId(currentChapter.index, talkIndex),
        index: talkIndex,
        globalIndex: talkGlobalIndex,
        label: labelMatch ? labelMatch[1] : `第${talkIndex}話`,
        fullTitle,
        title: stripLeadingLabel(fullTitle, labelMatch ? labelMatch[1] : ""),
        paragraphs: [],
      };
      currentChapter.talks.push(currentTalk);
      continue;
    }

    if (!currentTalk) {
      continue;
    }

    if (line.trim() === "") {
      paragraphBuffer = flushParagraph(currentTalk, paragraphBuffer);
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph(currentTalk, paragraphBuffer);

  return {
    title,
    chapters,
    chapterCount: chapters.length,
    talkCount: chapters.reduce((sum, chapter) => sum + chapter.talks.length, 0),
    paragraphCount: chapters.reduce(
      (sum, chapter) => sum + chapter.talks.reduce((inner, talk) => inner + talk.paragraphs.length, 0),
      0,
    ),
  };
}

export function toMarkdownDocument(novel) {
  const blocks = [`# ${novel.title}`];

  for (const chapter of novel.chapters) {
    blocks.push(`## ${chapter.fullTitle}`);

    for (const talk of chapter.talks) {
      blocks.push(`### ${talk.fullTitle}`);
      blocks.push(...talk.paragraphs);
    }
  }

  return `${blocks.join("\n\n")}\n`;
}

export function buildOutlineMarkdown(novel) {
  const blocks = [
    "# Chapter Outline",
    "",
    "## Structure",
    `- 章数: ${novel.chapterCount}`,
    `- 話数: ${novel.talkCount}`,
    `- 構成単位: 章 > 話`,
    "",
    "## Chapters",
  ];

  for (const chapter of novel.chapters) {
    blocks.push("");
    blocks.push(`### ${chapter.fullTitle}`);
    blocks.push(`- chapterId: ${chapter.id}`);
    blocks.push(`- 話数: ${chapter.talks.length}`);

    for (const talk of chapter.talks) {
      blocks.push("");
      blocks.push(`#### ${talk.fullTitle}`);
      blocks.push(`- talkId: ${talk.id}`);
      blocks.push(`- 段落数: ${talk.paragraphs.length}`);
    }
  }

  return `${blocks.join("\n")}\n`;
}

export function splitIntoSentences(text) {
  return text
    .split(/(?<=[。！？])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function truncateText(text, maxLength = 120) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function summarizeTalk(talk, maxLength = 92) {
  const firstParagraph = talk.paragraphs[0] || "";
  const lastParagraph = talk.paragraphs[talk.paragraphs.length - 1] || firstParagraph;
  const sentences = [
    ...splitIntoSentences(firstParagraph).slice(0, 1),
    ...splitIntoSentences(lastParagraph).slice(0, 1),
  ];
  const merged = sentences.join(" ");
  return truncateText(merged || talk.title, maxLength);
}

export function summarizeChapter(chapter, maxLength = 170) {
  const talkTitles = chapter.talks.slice(0, 3).map((talk) => stripLeadingLabel(talk.fullTitle, talk.label));
  const firstTalk = chapter.talks[0];
  const lastTalk = chapter.talks[chapter.talks.length - 1] || firstTalk;
  const firstSentence = splitIntoSentences(firstTalk?.paragraphs[0] || "").slice(0, 1).join("");
  const lastSentence = splitIntoSentences(lastTalk?.paragraphs[lastTalk.paragraphs.length - 1] || "")
    .slice(0, 1)
    .join("");
  const synopsis = [
    stripLeadingLabel(chapter.fullTitle, chapter.label),
    talkTitles.length > 0 ? `見どころは ${talkTitles.join("、")}` : "",
    firstSentence,
    lastSentence,
  ]
    .filter(Boolean)
    .join("。")
    .replace(/。。+/g, "。");

  return truncateText(synopsis, maxLength);
}
