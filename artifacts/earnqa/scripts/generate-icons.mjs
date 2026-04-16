import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const svgSrc = readFileSync(join(rootDir, "public", "favicon.svg"), "utf-8");

const sizes = [192, 512];

mkdirSync(join(rootDir, "public", "icons"), { recursive: true });

for (const size of sizes) {
  const resvg = new Resvg(svgSrc, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  });
  const png = resvg.render().asPng();
  const outPath = join(rootDir, "public", "icons", `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`✓ Generated ${outPath} (${png.length} bytes)`);
}

// Also generate a maskable icon with a gold background (safe zone padding)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="0" fill="#fbbf24"/>
  <defs>
    <radialGradient id="coin" cx="38%" cy="30%" r="75%" fx="38%" fy="30%">
      <stop offset="0%"   stop-color="#fef3c7"/>
      <stop offset="42%"  stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </radialGradient>
    <radialGradient id="edge" cx="50%" cy="50%" r="50%">
      <stop offset="80%"  stop-color="#d97706" stop-opacity="0"/>
      <stop offset="100%" stop-color="#92400e" stop-opacity="0.5"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="26" fill="url(#coin)"/>
  <circle cx="32" cy="32" r="26" fill="url(#edge)"/>
  <circle cx="32" cy="32" r="26" fill="none" stroke="#b45309" stroke-width="1.5" opacity="0.55"/>
  <circle cx="32" cy="32" r="15" fill="none" stroke="#1e3a5f" stroke-width="6"/>
  <circle cx="32" cy="32" r="15" fill="none" stroke="#fbbf24" stroke-width="1.5" opacity="0.25"/>
  <path d="M 20 22 A 14 14 0 0 1 34 16" stroke="white" stroke-width="3" fill="none" opacity="0.45" stroke-linecap="round"/>
</svg>`;

for (const size of [192, 512]) {
  const resvg = new Resvg(maskableSvg, {
    fitTo: { mode: "width", value: size },
    background: "#fbbf24",
  });
  const png = resvg.render().asPng();
  const outPath = join(rootDir, "public", "icons", `icon-maskable-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`✓ Generated ${outPath} (${png.length} bytes)`);
}

console.log("Done.");
