import { execFileSync } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const promptPath = path.join(rootDir, "prompts", "character-portraits.json");
const GEMINI_TIMEOUT_MS = 120000;
const portraitPalettes = [
  ["#f7eadf", "#cf9c76", "#4b2d21"],
  ["#e5ece1", "#7e9a7d", "#1f3124"],
  ["#e9e3ef", "#988bb2", "#30243f"],
  ["#dceaf2", "#77a6b7", "#1d3642"],
  ["#f2e0d7", "#c77b5c", "#53271d"],
];

function usage() {
  process.stderr.write(
    "Usage: node scripts/generate-character-portrait.mjs <character-id|--all> [reference-image-path] [--parallel=2] [--local-only]\n",
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

function readImageSize(filePath) {
  const output = execFileSync(
    "sips",
    ["-g", "pixelWidth", "-g", "pixelHeight", "-1", filePath],
    { encoding: "utf8" },
  );

  const widthMatch = output.match(/pixelWidth:\s+(\d+)/);
  const heightMatch = output.match(/pixelHeight:\s+(\d+)/);

  if (!widthMatch || !heightMatch) {
    throw new Error(`Failed to read dimensions for ${filePath}`);
  }

  return {
    width: Number(widthMatch[1]),
    height: Number(heightMatch[1]),
  };
}

function centerCropToSize(sourcePath, targetPath, targetWidth, targetHeight) {
  const targetDir = path.dirname(targetPath);
  const resizedPath = path.join(
    targetDir,
    `${path.basename(targetPath, path.extname(targetPath))}.resized.png`,
  );

  try {
    execFileSync(
      "sips",
      ["--resampleHeight", String(targetHeight), sourcePath, "--out", resizedPath],
      { stdio: "pipe" },
    );

    const resized = readImageSize(resizedPath);
    if (resized.width < targetWidth || resized.height < targetHeight) {
      execFileSync(
        "sips",
        ["--resampleWidth", String(targetWidth), resizedPath, "--out", resizedPath],
        { stdio: "pipe" },
      );
    }

    const finalSize = readImageSize(resizedPath);
    const offsetY = Math.max(0, Math.floor((finalSize.height - targetHeight) / 2));
    const offsetX = Math.max(0, Math.floor((finalSize.width - targetWidth) / 2));

    execFileSync(
      "sips",
      [
        "--cropToHeightWidth",
        String(targetHeight),
        String(targetWidth),
        "--cropOffset",
        String(offsetY),
        String(offsetX),
        resizedPath,
        "--out",
        targetPath,
      ],
      { stdio: "pipe" },
    );
  } finally {
    unlink(resizedPath).catch(() => {});
  }
}

function extractGeneratedImage(responseJson) {
  const candidates = responseJson.candidates ?? [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts ?? [];
    for (const part of parts) {
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
  const messages = [];

  for (const candidate of responseJson.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        messages.push(part.text.trim());
      }
    }
  }

  return messages;
}

function buildPrompt(spec, character) {
  const { fixedWidth, fixedHeight, globalPrompt, globalNegativePrompt } = spec;

  return [
    globalPrompt,
    character.prompt,
    "Do not include any visible text, lettering, captions, logos, watermarks, symbols, or decorative calligraphy anywhere in the image.",
    "Keep the whole character visible within frame when possible, especially head, key costume details, hands, silhouette, and signature accessories.",
    `Final delivery will be center-cropped to ${fixedWidth}x${fixedHeight}. Keep the face, silhouette, and signature costume details near the center with safe margins.`,
    `Negative prompt: ${globalNegativePrompt}, ${character.negativePrompt || ""}`,
  ].join("\n");
}

function buildImageConfig(model) {
  const imageConfig = {
    imageSize: "2K",
  };

  // Some Gemini preview models reject aspectRatio while still returning images.
  if (!String(model).includes("pro-preview")) {
    imageConfig.aspectRatio = "9:16";
  }

  return imageConfig;
}

function buildRequestBody(prompt, referenceBuffer, referenceMimeType, model) {
  const parts = [];

  if (referenceBuffer && referenceMimeType) {
    parts.push({
      inlineData: {
        mimeType: referenceMimeType,
        data: referenceBuffer.toString("base64"),
      },
    });
  }

  parts.push({ text: prompt });

  return {
    contents: [
      {
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: buildImageConfig(model),
    },
  };
}

async function generateCharacter(character, promptFile, apiKey, cliReferencePath) {
  const outputDir = path.join(
    rootDir,
    promptFile.spec?.outputDir || "project/assets/characters",
  );
  const referencePath =
    cliReferencePath ||
    (character.referenceImage ? path.join(rootDir, character.referenceImage) : null);
  let referenceBuffer = null;
  let referenceMimeType = null;

  if (referencePath) {
    referenceBuffer = await readFile(referencePath);
    referenceMimeType = getMimeType(referencePath);
  }

  const prompt = buildPrompt(promptFile.spec, character);
  const requestBody = buildRequestBody(prompt, referenceBuffer, referenceMimeType, character.model);
  const { fixedWidth, fixedHeight } = promptFile.spec;

  process.stdout.write(`Generating ${character.id} with ${character.model}...\n`);

  async function renderLocalPortrait(reason) {
    await mkdir(outputDir, { recursive: true });

    const palette = portraitPalettes[
      Math.abs([...character.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % portraitPalettes.length
    ];
    const [bgA, bgB, ink] = palette;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${fixedWidth}" height="${fixedHeight}" viewBox="0 0 ${fixedWidth} ${fixedHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="18%" r="65%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${fixedWidth}" height="${fixedHeight}" fill="url(#bg)" />
  <rect width="${fixedWidth}" height="${fixedHeight}" fill="url(#glow)" />
  <circle cx="${fixedWidth / 2}" cy="${fixedHeight * 0.42}" r="${fixedWidth * 0.26}" fill="#ffffff" fill-opacity="0.14" />
  <path d="M${fixedWidth * 0.28} ${fixedHeight * 0.76} C ${fixedWidth * 0.34} ${fixedHeight * 0.56}, ${fixedWidth * 0.66} ${fixedHeight * 0.56}, ${fixedWidth * 0.72} ${fixedHeight * 0.76} L ${fixedWidth * 0.72} ${fixedHeight * 0.88} L ${fixedWidth * 0.28} ${fixedHeight * 0.88} Z" fill="${ink}" fill-opacity="0.24" />
  <circle cx="${fixedWidth / 2}" cy="${fixedHeight * 0.34}" r="${fixedWidth * 0.14}" fill="${ink}" fill-opacity="0.2" />
  <rect x="${fixedWidth * 0.08}" y="${fixedHeight * 0.07}" width="${fixedWidth * 0.84}" height="${fixedHeight * 0.86}" rx="36" fill="none" stroke="#ffffff" stroke-opacity="0.26" />
</svg>`;

    const rawOutputPath = path.join(outputDir, `${character.id}.svg`);
    const finalOutputPath = path.join(outputDir, `${character.id}.png`);
    const metadataPath = path.join(outputDir, `${character.id}.json`);

    await writeFile(rawOutputPath, svg, "utf8");

    const baseImage = sharp(Buffer.from(svg));
    const composites = [];
    if (referenceBuffer) {
      const referenceLayer = await sharp(referenceBuffer)
        .resize({
          width: Math.round(fixedWidth * 0.54),
          height: Math.round(fixedHeight * 0.56),
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

      composites.push({
        input: referenceLayer,
        left: Math.round(fixedWidth * 0.23),
        top: Math.round(fixedHeight * 0.2),
      });
    }

    await baseImage.composite(composites).png().toFile(finalOutputPath);

    const metadata = {
      characterId: character.id,
      name: character.name,
      generatedAt: new Date().toISOString(),
      output: path.relative(rootDir, finalOutputPath),
      rawOutput: path.relative(rootDir, rawOutputPath),
      referenceImage: referencePath ? path.relative(rootDir, referencePath) : null,
      fixedSize: {
        width: fixedWidth,
        height: fixedHeight,
      },
      prompt,
      sourceRefs: character.sourceRefs,
      mode: "local-fallback",
      reason,
    };

    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    return path.relative(rootDir, finalOutputPath);
  }

  if (!apiKey) {
    return renderLocalPortrait("GEMINI_API_KEY unavailable");
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${character.model}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
      const errorText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
    }

    const responseJson = await response.json();
    const image = extractGeneratedImage(responseJson);
    if (!image) {
      throw new Error(`Gemini response did not include an image: ${JSON.stringify(responseJson)}`);
    }

    await mkdir(outputDir, { recursive: true });

    const rawExtension = getExtensionForMimeType(image.mimeType);
    const rawOutputPath = path.join(outputDir, `${character.id}.raw${rawExtension}`);
    const finalOutputPath = path.join(outputDir, `${character.id}.png`);
    const metadataPath = path.join(outputDir, `${character.id}.json`);

    await writeFile(rawOutputPath, Buffer.from(image.data, "base64"));
    centerCropToSize(rawOutputPath, finalOutputPath, fixedWidth, fixedHeight);

    const metadata = {
      characterId: character.id,
      name: character.name,
      model: character.model,
      generatedAt: new Date().toISOString(),
      output: path.relative(rootDir, finalOutputPath),
      rawOutput: path.relative(rootDir, rawOutputPath),
      referenceImage: referencePath ? path.relative(rootDir, referencePath) : null,
      fixedSize: {
        width: fixedWidth,
        height: fixedHeight,
      },
      prompt,
      sourceRefs: character.sourceRefs,
      responseTexts: extractTextResponses(responseJson),
      mode: "gemini",
    };

    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    return path.relative(rootDir, finalOutputPath);
  } catch (error) {
    return renderLocalPortrait(error.message);
  }
}

function parseArgs(argv) {
  const parsed = {
    target: argv[2],
    cliReferencePath: null,
    parallel: 2,
    localOnly: false,
  };

  for (const arg of argv.slice(3)) {
    if (arg.startsWith("--parallel=")) {
      parsed.parallel = Number(arg.slice("--parallel=".length));
    } else if (arg === "--local-only") {
      parsed.localOnly = true;
    } else if (!parsed.cliReferencePath) {
      parsed.cliReferencePath = arg;
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

async function main() {
  const args = parseArgs(process.argv);
  if (!args.target) {
    usage();
    process.exitCode = 1;
    return;
  }

  const envSource = await readFile(envPath, "utf8");
  const env = parseEnvFile(envSource);
  const apiKey = args.localOnly ? "" : env.GEMINI_API_KEY;

  if (!apiKey && !args.localOnly) {
    throw new Error("GEMINI_API_KEY is missing from .env");
  }

  const promptFile = JSON.parse(await readFile(promptPath, "utf8"));
  const characters =
    args.target === "--all"
      ? promptFile.characters
      : promptFile.characters.filter((entry) => entry.id === args.target);

  if (characters.length === 0) {
    throw new Error(`Unknown character id: ${args.target}`);
  }

  const completed = await runWithConcurrency(
    characters,
    Number.isFinite(args.parallel) && args.parallel > 0 ? args.parallel : 2,
    (character) => generateCharacter(character, promptFile, apiKey, args.cliReferencePath),
  );

  process.stdout.write(`${completed.join("\n")}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
