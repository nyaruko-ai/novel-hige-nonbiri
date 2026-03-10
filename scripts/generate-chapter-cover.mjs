import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const promptPath = path.join(rootDir, "prompts", "chapter-cover-images.json");
const GEMINI_TIMEOUT_MS = 120000;

const moodPalettes = {
  sunrise: ["#f8ead8", "#d8aa78", "#5c3929"],
  grove: ["#dde7dc", "#89a07f", "#203124"],
  mist: ["#e6e1eb", "#9e99b2", "#2d2738"],
  river: ["#dceaf1", "#78a0b6", "#1f3946"],
  ember: ["#f1e2d9", "#c27b56", "#4a2419"],
  harvest: ["#f5e9d2", "#d5b25b", "#544018"],
  night: ["#dce1ea", "#5d7694", "#162433"],
};

function usage() {
  process.stderr.write(
    "Usage: node scripts/generate-chapter-cover.mjs <chapter-id|--all> [--parallel=2] [--local-only]\n",
  );
}

function parseEnvFile(source) {
  const env = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function getExtensionForMimeType(mimeType) {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    default:
      return ".bin";
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Unsupported image type: ${ext}`);
  }
}

function extractGeneratedImage(responseJson) {
  const candidates = responseJson.candidates ?? [];

  for (const candidate of candidates) {
    for (const part of candidate?.content?.parts ?? []) {
      const data = part.inlineData ?? part.inline_data;
      if (data?.data && data?.mimeType) {
        return {
          data: data.data,
          mimeType: data.mimeType,
        };
      }
    }
  }

  return null;
}

function extractTextResponses(responseJson) {
  const texts = [];
  for (const candidate of responseJson.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        texts.push(part.text.trim());
      }
    }
  }
  return texts;
}

function parseArgs(argv) {
  const parsed = {
    target: argv[2],
    parallel: 2,
    localOnly: false,
  };

  for (const arg of argv.slice(3)) {
    if (arg.startsWith("--parallel=")) {
      parsed.parallel = Number(arg.slice("--parallel=".length));
    } else if (arg === "--local-only") {
      parsed.localOnly = true;
    }
  }

  return parsed;
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => consume()));
  return results;
}

function buildLocalSvg(entry, width, height) {
  const [bgA, bgB, ink] = moodPalettes[entry.mood] || moodPalettes.sunrise;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="20%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="28" />
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" fill="url(#glow)" />
  <circle cx="${width * 0.78}" cy="${height * 0.22}" r="${height * 0.09}" fill="rgba(255,255,255,0.45)" filter="url(#blur)" />
  <path d="M0 ${height * 0.72} C ${width * 0.2} ${height * 0.63}, ${width * 0.42} ${height * 0.79}, ${width * 0.63} ${height * 0.68} S ${width * 0.9} ${height * 0.55}, ${width} ${height * 0.68} L ${width} ${height} L 0 ${height} Z" fill="${ink}" fill-opacity="0.18" />
  <path d="M0 ${height * 0.8} C ${width * 0.18} ${height * 0.7}, ${width * 0.46} ${height * 0.9}, ${width * 0.7} ${height * 0.76} S ${width * 0.88} ${height * 0.64}, ${width} ${height * 0.78} L ${width} ${height} L 0 ${height} Z" fill="${ink}" fill-opacity="0.3" />
  <g opacity="0.18">
    <path d="M${width * 0.1} ${height * 0.2} Q ${width * 0.42} ${height * 0.1}, ${width * 0.78} ${height * 0.28}" stroke="${ink}" stroke-width="3" fill="none" />
    <path d="M${width * 0.14} ${height * 0.27} Q ${width * 0.48} ${height * 0.17}, ${width * 0.82} ${height * 0.34}" stroke="${ink}" stroke-width="2" fill="none" />
  </g>
  <rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.84}" height="${height * 0.84}" rx="42" fill="none" stroke="#ffffff" stroke-opacity="0.28" />
</svg>`;
}

async function renderLocalCover(entry, promptFile, outputDir, reason) {
  const svg = buildLocalSvg(entry, promptFile.spec.fixedWidth, promptFile.spec.fixedHeight);
  const rawPath = path.join(outputDir, `${entry.id}.svg`);
  const finalPath = path.join(outputDir, `${entry.id}.webp`);
  const metadataPath = path.join(outputDir, `${entry.id}.json`);

  await writeFile(rawPath, svg, "utf8");
  await sharp(Buffer.from(svg))
    .webp({ quality: 86, effort: 6 })
    .toFile(finalPath);

  const metadata = {
    id: entry.id,
    chapterTitle: entry.chapterTitle,
    generatedAt: new Date().toISOString(),
    output: path.relative(rootDir, finalPath),
    rawOutput: path.relative(rootDir, rawPath),
    mode: "local-fallback",
    reason,
    prompt: entry.prompt,
  };

  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return path.relative(rootDir, finalPath);
}

async function requestGemini(entry, promptFile, apiKey) {
  const referenceParts = [];
  for (const relativePath of entry.referenceImages || []) {
    const absolutePath = path.join(rootDir, relativePath);
    try {
      const buffer = await readFile(absolutePath);
      referenceParts.push({
        inlineData: {
          mimeType: getMimeType(absolutePath),
          data: buffer.toString("base64"),
        },
      });
    } catch {
      // Missing reference images are ignored so the prompt file can be generated before assets exist.
    }
  }

  const requestBody = {
    contents: [
      {
        parts: [
          ...referenceParts,
          {
            text: [
              promptFile.spec.globalPrompt,
              entry.prompt,
              "Do not include any visible text, letters, captions, logos, watermarks, signage, or decorative calligraphy anywhere in the image.",
              referenceParts.length > 0
                ? "Reference character portraits are attached. Preserve their costume, silhouette, beard, ears, color accents, and species cues while adapting them into the watercolor frontispiece."
                : "",
              `Negative prompt: ${promptFile.spec.globalNegativePrompt}, ${entry.negativePrompt || ""}`,
            ]
              .filter(Boolean)
              .join(" "),
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: "3:4",
        imageSize: "2K",
      },
    },
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${entry.model || promptFile.spec.defaultModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
  }

  const responseJson = await response.json();
  const image = extractGeneratedImage(responseJson);
  if (!image) {
    throw new Error(`Gemini response did not include an image: ${JSON.stringify(responseJson)}`);
  }

  return {
    image,
    responseTexts: extractTextResponses(responseJson),
  };
}

async function generateCover(entry, promptFile, apiKey) {
  const outputDir = path.join(rootDir, promptFile.spec.outputDir || "project/assets/chapters");
  await mkdir(outputDir, { recursive: true });
  process.stdout.write(`Generating ${entry.id} with ${entry.model || promptFile.spec.defaultModel}...\n`);

  if (!apiKey) {
    return renderLocalCover(entry, promptFile, outputDir, "GEMINI_API_KEY unavailable");
  }

  try {
    const { image, responseTexts } = await requestGemini(entry, promptFile, apiKey);
    const rawExtension = getExtensionForMimeType(image.mimeType);
    const rawPath = path.join(outputDir, `${entry.id}.raw${rawExtension}`);
    const finalPath = path.join(outputDir, `${entry.id}.webp`);
    const metadataPath = path.join(outputDir, `${entry.id}.json`);

    await writeFile(rawPath, Buffer.from(image.data, "base64"));
    await sharp(rawPath)
      .resize({
        width: promptFile.spec.fixedWidth,
        height: promptFile.spec.fixedHeight,
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: 84, effort: 6 })
      .toFile(finalPath);

    const metadata = {
      id: entry.id,
      chapterTitle: entry.chapterTitle,
      generatedAt: new Date().toISOString(),
      output: path.relative(rootDir, finalPath),
      rawOutput: path.relative(rootDir, rawPath),
      mode: "gemini",
      prompt: entry.prompt,
      referenceImages: entry.referenceImages || [],
      responseTexts,
    };

    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    return path.relative(rootDir, finalPath);
  } catch (error) {
    return renderLocalCover(entry, promptFile, outputDir, error.message);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.target) {
    usage();
    process.exitCode = 1;
    return;
  }

  const promptFile = JSON.parse(await readFile(promptPath, "utf8"));
  let apiKey = "";
  if (!args.localOnly) {
    try {
      apiKey = parseEnvFile(await readFile(envPath, "utf8")).GEMINI_API_KEY || "";
    } catch {
      apiKey = "";
    }
  }

  const entries =
    args.target === "--all"
      ? promptFile.chapters
      : promptFile.chapters.filter((entry) => entry.id === args.target);

  if (entries.length === 0) {
    throw new Error(`Unknown chapter id: ${args.target}`);
  }

  const completed = await runWithConcurrency(
    entries,
    Number.isFinite(args.parallel) && args.parallel > 0 ? args.parallel : 2,
    (entry) => generateCover(entry, promptFile, apiKey),
  );

  process.stdout.write(`${completed.join("\n")}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
