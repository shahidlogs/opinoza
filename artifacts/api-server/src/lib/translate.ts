/**
 * On-demand question translation via OpenAI gpt-5-mini.
 * Returns translated title, description, and pollOptions.
 * Does NOT persist to the database — caching is the client's responsibility.
 */
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "placeholder",
});

export interface TranslationResult {
  title: string;
  description: string | null;
  pollOptions: string[] | null;
  targetLang: string;
  originalLang: string | null;
}

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
  it: "Italian", nl: "Dutch", pl: "Polish", ru: "Russian", tr: "Turkish",
  ar: "Arabic", zh: "Chinese", ja: "Japanese", ko: "Korean", hi: "Hindi",
  vi: "Vietnamese", th: "Thai", id: "Indonesian", sv: "Swedish", no: "Norwegian",
  da: "Danish", fi: "Finnish", uk: "Ukrainian", ro: "Romanian", hu: "Hungarian",
  cs: "Czech", sk: "Slovak", bg: "Bulgarian", hr: "Croatian", sr: "Serbian",
  he: "Hebrew", fa: "Persian", bn: "Bengali", ta: "Tamil", ms: "Malay",
  tl: "Filipino", ka: "Georgian", hy: "Armenian", sw: "Swahili",
};

export async function translateQuestion(
  title: string,
  description: string | null,
  pollOptions: string[] | null,
  targetLang: string,
  originalLang: string | null,
): Promise<TranslationResult> {
  const langName = LANG_NAMES[targetLang] ?? targetLang;

  const payload: Record<string, unknown> = { title };
  if (description) payload.description = description;
  if (pollOptions?.length) payload.pollOptions = pollOptions;

  const prompt = `Translate the following survey question JSON into ${langName}.
Return ONLY valid JSON with the same keys. Preserve formatting, punctuation, and tone.
Do not add explanations or wrap in markdown.

Input JSON:
${JSON.stringify(payload)}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content: "You are a professional translator. Return only valid JSON, no explanation.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Strip markdown code fence if present
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(stripped);
  }

  return {
    title: String(parsed.title ?? title),
    description: parsed.description != null ? String(parsed.description) : description,
    pollOptions: Array.isArray(parsed.pollOptions)
      ? (parsed.pollOptions as unknown[]).map(String)
      : pollOptions,
    targetLang,
    originalLang,
  };
}
