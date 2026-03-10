import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "project", "assets", "ui");

function buildReaderTextureSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="1800" viewBox="0 0 1200 1800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fbf5ea"/>
      <stop offset="100%" stop-color="#eadfce"/>
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="12%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="14"/>
    </filter>
  </defs>
  <rect width="1200" height="1800" fill="url(#paper)"/>
  <rect width="1200" height="1800" fill="url(#glow)"/>
  <g opacity="0.08" stroke="#8b6f4d" fill="none">
    <path d="M120 160 Q 380 80 640 170 T 1080 180" stroke-width="4"/>
    <path d="M100 520 Q 420 430 760 540 T 1110 560" stroke-width="3"/>
    <path d="M90 920 Q 390 840 700 930 T 1120 960" stroke-width="3"/>
    <path d="M110 1320 Q 360 1230 700 1320 T 1080 1360" stroke-width="4"/>
  </g>
  <g opacity="0.12">
    <circle cx="980" cy="260" r="160" fill="#fff6e7" filter="url(#blur)"/>
    <circle cx="240" cy="1500" r="180" fill="#f3e7d3" filter="url(#blur)"/>
  </g>
  <g opacity="0.08" fill="#7a6345">
    <circle cx="160" cy="220" r="2"/>
    <circle cx="360" cy="460" r="2"/>
    <circle cx="910" cy="880" r="2"/>
    <circle cx="740" cy="1260" r="2"/>
    <circle cx="980" cy="1560" r="2"/>
  </g>
</svg>`;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const texturePath = path.join(outputDir, "reader-texture.svg");
  await writeFile(texturePath, buildReaderTextureSvg(), "utf8");
  process.stdout.write(`${path.relative(rootDir, texturePath)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
