/**
 * Opinoza TWA Asset Generator
 * Generates all Android density-bucket PNG assets from SVG sources.
 * Run: node scripts/generate-twa-assets.mjs
 */
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const twaDir = join(root, "public", "twa");

function rasterize(svgStr, widthPx, bg = "rgba(0,0,0,0)") {
  const resvg = new Resvg(svgStr, {
    fitTo: { mode: "width", value: widthPx },
    background: bg,
  });
  return resvg.render().asPng();
}

function save(dir, filename, buf) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, buf);
  console.log(`  ✓ ${path.replace(root, ".")} (${(buf.length / 1024).toFixed(1)}KB)`);
}

// ─── Source SVGs ─────────────────────────────────────────────────────────────

// Coin on transparent background (used for adaptive icon foreground + splash icon)
const COIN_SVG = readFileSync(join(root, "public", "favicon.svg"), "utf-8");

// Coin on gold background (maskable launcher icon — full bleed adaptive)
const MASKABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <rect width="108" height="108" fill="#fbbf24"/>
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
  <!-- Coin fills safe zone (72dp of 108dp canvas = 66%) -->
  <circle cx="54" cy="54" r="42" fill="url(#coin)"/>
  <circle cx="54" cy="54" r="42" fill="url(#edge)"/>
  <circle cx="54" cy="54" r="42" fill="none" stroke="#b45309" stroke-width="1.5" opacity="0.55"/>
  <circle cx="54" cy="54" r="25" fill="none" stroke="#1e3a5f" stroke-width="9.5"/>
  <circle cx="54" cy="54" r="25" fill="none" stroke="#fbbf24" stroke-width="1.5" opacity="0.25"/>
  <path d="M 28 36 A 24 24 0 0 1 52 22" stroke="white" stroke-width="5" fill="none" opacity="0.45" stroke-linecap="round"/>
</svg>`;

// Coin centered on white plate for splash icon (windowSplashScreenAnimatedIcon)
// Android 12+ renders this at 240dp — icon should fill the safe zone (~160dp)
const SPLASH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
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
  <!-- Coin fills safe zone on transparent background -->
  <circle cx="120" cy="120" r="108" fill="url(#coin)"/>
  <circle cx="120" cy="120" r="108" fill="url(#edge)"/>
  <circle cx="120" cy="120" r="108" fill="none" stroke="#b45309" stroke-width="4" opacity="0.55"/>
  <circle cx="120" cy="120" r="64" fill="none" stroke="#1e3a5f" stroke-width="24"/>
  <circle cx="120" cy="120" r="64" fill="none" stroke="#fbbf24" stroke-width="4" opacity="0.25"/>
  <path d="M 66 82 A 62 62 0 0 1 128 52" stroke="white" stroke-width="12" fill="none" opacity="0.45" stroke-linecap="round"/>
</svg>`;

// "Opinoza" wordmark for splash branding image (bottom of splash)
// Rendered with generous horizontal padding; text centered
const BRANDING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 96">
  <text
    x="200" y="72"
    font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
    font-size="64"
    font-weight="800"
    fill="#1e3a5f"
    text-anchor="middle"
    letter-spacing="-1"
    opacity="0.9"
  >Opinoza</text>
</svg>`;

// ─── Density buckets ──────────────────────────────────────────────────────────

const LAUNCHER_SIZES = [
  { dir: "mipmap-mdpi",    px: 48  },
  { dir: "mipmap-hdpi",    px: 72  },
  { dir: "mipmap-xhdpi",   px: 96  },
  { dir: "mipmap-xxhdpi",  px: 144 },
  { dir: "mipmap-xxxhdpi", px: 192 },
];

const FOREGROUND_SIZES = [
  { dir: "mipmap-mdpi",    px: 108 },
  { dir: "mipmap-hdpi",    px: 162 },
  { dir: "mipmap-xhdpi",   px: 216 },
  { dir: "mipmap-xxhdpi",  px: 324 },
  { dir: "mipmap-xxxhdpi", px: 432 },
];

// Splash icon: Android renders at 240dp; provide xxxhdpi (4×) = 960px
const SPLASH_ICON_SIZES = [
  { dir: "drawable-mdpi",    px: 240 },
  { dir: "drawable-hdpi",    px: 360 },
  { dir: "drawable-xhdpi",   px: 480 },
  { dir: "drawable-xxhdpi",  px: 720 },
  { dir: "drawable-xxxhdpi", px: 960 },
];

// Branding image: ~200dp wide; at 1× = 400×96px (already matches SVG viewBox)
const BRANDING_SIZES = [
  { dir: "drawable-mdpi",    px: 400  },
  { dir: "drawable-hdpi",    px: 600  },
  { dir: "drawable-xhdpi",   px: 800  },
  { dir: "drawable-xxhdpi",  px: 1200 },
  { dir: "drawable-xxxhdpi", px: 1600 },
];

// ─── Generate ─────────────────────────────────────────────────────────────────

console.log("\n📱 Generating Opinoza TWA assets...\n");

console.log("→ Launcher icons (ic_launcher.png — with gold background):");
for (const { dir, px } of LAUNCHER_SIZES) {
  save(join(twaDir, "res", dir), "ic_launcher.png", rasterize(MASKABLE_SVG, px, "#fbbf24"));
}

console.log("\n→ Launcher icons (ic_launcher_round.png — same as standard):");
for (const { dir, px } of LAUNCHER_SIZES) {
  save(join(twaDir, "res", dir), "ic_launcher_round.png", rasterize(MASKABLE_SVG, px, "#fbbf24"));
}

console.log("\n→ Adaptive icon foreground (ic_launcher_foreground.png — coin on transparent):");
for (const { dir, px } of FOREGROUND_SIZES) {
  save(join(twaDir, "res", dir), "ic_launcher_foreground.png", rasterize(COIN_SVG, px));
}

console.log("\n→ Splash screen icon (ic_splash_icon.png — for windowSplashScreenAnimatedIcon):");
for (const { dir, px } of SPLASH_ICON_SIZES) {
  save(join(twaDir, "res", dir), "ic_splash_icon.png", rasterize(SPLASH_ICON_SVG, px));
}

console.log("\n→ Splash branding image (splash_branding.png — Opinoza wordmark):");
for (const { dir, px } of BRANDING_SIZES) {
  save(join(twaDir, "res", dir), "splash_branding.png", rasterize(BRANDING_SVG, px));
}

console.log("\n✅ All TWA assets generated.\n");
