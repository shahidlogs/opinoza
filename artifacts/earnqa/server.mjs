/**
 * Production server for the Opinoza frontend.
 * - Serves the built Vite SPA from dist/public
 * - For social-media bot user-agents on /question/:id routes, returns
 *   server-rendered HTML with Open Graph meta tags so WhatsApp / Facebook
 *   previews show the question title and image.
 * - Everything else is forwarded to index.html (SPA fallback).
 */

import express from "express";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist/public");
const PORT = Number(process.env.PORT ?? 5000);
const APP_BASE_URL = (process.env.APP_BASE_URL ?? "https://opinoza.com").replace(/\/$/, "");

// Known social-media crawler user-agent patterns
const BOT_RE =
  /facebookexternalhit|Facebot|WhatsApp|Twitterbot|LinkedInBot|Pinterestbot|Slackbot|TelegramBot|Discordbot|Google-InspectionTool|ia_archiver/i;

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Direct DB connection for OG queries (same DATABASE_URL the API server uses)
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;

async function getQuestion(id) {
  if (!pool || isNaN(id)) return null;
  try {
    const { rows } = await pool.query(
      "SELECT title, description FROM questions WHERE id = $1 AND status = 'active' LIMIT 1",
      [id],
    );
    return rows[0] ?? null;
  } catch (err) {
    console.error("[OG] DB query error:", err.message);
    return null;
  }
}

function buildOgHtml({ title, description, pageUrl, ogImage }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Opinoza" />
  <meta property="og:title" content="${escHtml(title)}" />
  <meta property="og:description" content="${escHtml(description)}" />
  <meta property="og:image" content="${escHtml(ogImage)}" />
  <meta property="og:image:width" content="1280" />
  <meta property="og:image:height" content="720" />
  <meta property="og:url" content="${escHtml(pageUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escHtml(title)}" />
  <meta name="twitter:description" content="${escHtml(description)}" />
  <meta name="twitter:image" content="${escHtml(ogImage)}" />
  <link rel="canonical" href="${escHtml(pageUrl)}" />
  <meta http-equiv="refresh" content="0;url=${escHtml(pageUrl)}" />
  <script>window.location.replace(${JSON.stringify(pageUrl)})</script>
</head>
<body>
  <p>Redirecting… <a href="${escHtml(pageUrl)}">${escHtml(title)}</a></p>
</body>
</html>`;
}

const app = express();

// Serve static assets (JS, CSS, images, etc.)
app.use(express.static(DIST));

// Bot-aware handler for question pages
app.get("/question/:id", async (req, res) => {
  const isBot = BOT_RE.test(req.headers["user-agent"] ?? "");
  const id = parseInt(req.params.id, 10);

  if (!isBot) {
    return res.sendFile(path.join(DIST, "index.html"));
  }

  const pageUrl = `${APP_BASE_URL}/question/${id}`;
  const ogImage = `${APP_BASE_URL}/opengraph.jpg`;

  let title = "Opinoza – Answer Questions & Earn Money";
  let description = "Share your opinions and earn 1¢ per answer. Join Opinoza today.";

  const q = await getQuestion(id);
  if (q) {
    title = q.title;
    description = q.description
      ? q.description.substring(0, 200)
      : `Answer "${q.title}" and earn 1¢ on Opinoza.`;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.send(buildOgHtml({ title, description, pageUrl, ogImage }));
});

// SPA fallback — all other routes serve index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Opinoza web server listening on port ${PORT}`);
});
