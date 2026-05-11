import { Router, type IRouter } from "express";
import { db, questionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const BOT_RE =
  /facebookexternalhit|Twitterbot|WhatsApp|LinkedInBot|TelegramBot|Slackbot|Discordbot|Googlebot|bingbot|Applebot|Pinterest|Snapchat/i;

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

router.get("/og/q/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const canonicalUrl = `https://opinoza.com/questions/${id}`;

  if (isNaN(id) || id <= 0) {
    return res.redirect(301, "https://opinoza.com");
  }

  const ua = req.headers["user-agent"] ?? "";
  const isBot = BOT_RE.test(ua);

  if (!isBot) {
    return res.redirect(301, canonicalUrl);
  }

  try {
    const question = await db.query.questionsTable.findFirst({
      where: eq(questionsTable.id, id),
      columns: { id: true, title: true, description: true },
    });

    if (!question) {
      return res.redirect(301, "https://opinoza.com");
    }

    const ogTitle = esc(`${question.title} – Opinoza`);
    const ogDescription = question.description
      ? esc(`${question.description.slice(0, 155)}… Answer and earn 1¢ on Opinoza.`)
      : esc(`Answer this question and earn 1¢ on Opinoza.`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${ogTitle}</title>
  <meta name="description" content="${ogDescription}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Opinoza">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${ogDescription}">
  <meta property="og:image" content="https://opinoza.com/opengraph.jpg">
  <meta property="og:image:width" content="1280">
  <meta property="og:image:height" content="720">
  <meta property="og:url" content="${canonicalUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${ogDescription}">
  <meta name="twitter:image" content="https://opinoza.com/opengraph.jpg">
  <link rel="canonical" href="${canonicalUrl}">
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}">
</head>
<body>
  <p>Redirecting… <a href="${canonicalUrl}">Click here if not redirected</a></p>
</body>
</html>`);
  } catch {
    return res.redirect(301, canonicalUrl);
  }
});

export default router;
