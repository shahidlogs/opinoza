/**
 * Lightweight, offline language detection.
 *
 * Strategy (in priority order):
 *   1. Unicode-script detection for non-Latin scripts — these are 100% reliable
 *      because the character set itself identifies the language family.
 *   2. Pure-ASCII heuristic — pure ASCII text is almost certainly English (or
 *      another non-accented Latin language); return "und" rather than a false
 *      Romance-language guess from franc-min.
 *   3. franc-min trigram detection — used only when (1) and (2) don't apply,
 *      i.e. Latin text that contains accented characters.
 *
 * Returns an ISO 639-1 two-letter code (e.g. "en", "ar", "zh") or "und"
 * (undetermined) when detection is not confident enough.
 */
import { franc } from "franc-min";

const ISO6393_TO_639_1: Record<string, string> = {
  eng: "en", fra: "fr", spa: "es", por: "pt", deu: "de",
  ita: "it", nld: "nl", swe: "sv", nor: "no", dan: "da",
  fin: "fi", pol: "pl", ces: "cs", slk: "sk", hun: "hu",
  ron: "ro", hrv: "hr", bul: "bg", slv: "sl", srp: "sr",
  ukr: "uk", rus: "ru", bel: "be", mkd: "mk", sqi: "sq",
  tur: "tr", aze: "az", kaz: "kk", uzb: "uz", mon: "mn",
  ara: "ar", heb: "he", fas: "fa", urd: "ur", hin: "hi",
  ben: "bn", tam: "ta", tel: "te", mal: "ml", kan: "kn",
  mar: "mr", guj: "gu", pan: "pa", sin: "si", nep: "ne",
  zho: "zh", jpn: "ja", kor: "ko", vie: "vi", tha: "th",
  ind: "id", msa: "ms", tgl: "tl", jav: "jv", mya: "my",
  khm: "km", lao: "lo", kat: "ka", hye: "hy",
  swa: "sw", hau: "ha", yor: "yo", ibo: "ig", zul: "zu",
  xho: "xh", afr: "af", amh: "am", som: "so",
};

// Romance/Germanic languages that franc-min frequently false-positives for
// short pure-ASCII English text.  If franc-min returns one of these AND the
// text is pure ASCII, it's almost certainly English — return "und" instead.
const PURE_ASCII_AMBIGUOUS = new Set(["fr", "pt", "es", "it", "ro", "de", "nl", "sv", "da", "no", "tr", "ha", "cs", "hu"]);

/**
 * Detect the language of the given text.
 * @param text - The text to analyse (title + description recommended).
 * @returns A 2-letter ISO 639-1 code, or "und" if undetermined.
 */
export function detectLang(text: string): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 6) return "und";

  // ── 1. Unicode-script detection (non-Latin scripts) ─────────────────────────
  // Checks are ordered by rough global speaker count for early exit speed.
  if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(trimmed)) {
    return /[\u3040-\u309F\u30A0-\u30FF]/.test(trimmed) ? "ja" : "zh";
  }
  if (/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(trimmed)) return "ar";
  if (/[\u0900-\u097F]/.test(trimmed)) return "hi";   // Devanagari → Hindi
  if (/[\u0400-\u04FF]/.test(trimmed)) return "ru";   // Cyrillic → Russian (most common)
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(trimmed)) return "ko";
  if (/[\u0E00-\u0E7F]/.test(trimmed)) return "th";
  if (/[\u0590-\u05FF\uFB1D-\uFB4F]/.test(trimmed)) return "he";
  if (/[\u0980-\u09FF]/.test(trimmed)) return "bn";   // Bengali
  if (/[\u0B80-\u0BFF]/.test(trimmed)) return "ta";   // Tamil
  if (/[\u0C00-\u0C7F]/.test(trimmed)) return "te";   // Telugu
  if (/[\u0D00-\u0D7F]/.test(trimmed)) return "ml";   // Malayalam
  if (/[\u0370-\u03FF]/.test(trimmed)) return "el";   // Greek

  // ── 2. "Effectively Latin" heuristic ────────────────────────────────────────
  // Text that contains only ASCII + common typographic characters (em/en dash,
  // curly quotes, ellipsis, non-breaking space, ©, ®, ™ …) is treated as
  // "effectively ASCII" — franc-min frequently mislabels short English text
  // that uses these characters as French, Portuguese, Spanish, etc.
  // We remove the typographic characters, then check if what remains is pure ASCII.
  const withoutTypo = trimmed.replace(
    /[\u2013\u2014\u2015\u2018\u2019\u201C\u201D\u2026\u00A0\u00AB\u00BB\u2022\u00AE\u00A9\u2122]/g,
    "",
  );
  const effectivelyAscii = !/[^\x00-\x7F]/.test(withoutTypo);

  if (effectivelyAscii) {
    // Still run franc-min — but only trust "eng" (English) results.
    // Any other result for effectively-ASCII text is a franc-min false positive.
    const iso6393 = franc(trimmed, { minLength: 10 });
    if (iso6393 === "eng") return "en";
    // Not confident enough → undetermined.
    // Avoids labelling "Texting or calling — which do you prefer?" as Portuguese.
    return "und";
  }

  // ── 3. franc-min — Latin text WITH diacritics ────────────────────────────────
  // At this point the text has accented/special Latin characters that are
  // language-specific (e.g. é, ñ, ç, ü, ø …), so franc-min has strong signal.
  // Example: "¿Cuál es tu color favorito?" → clearly Spanish.
  const iso6393 = franc(trimmed, { minLength: 6 });
  if (!iso6393 || iso6393 === "und") return "und";
  const lang2 = ISO6393_TO_639_1[iso6393] ?? "und";

  // Belt-and-suspenders: if franc still returned an ambiguous Latin language
  // but the text is effectively ASCII (shouldn't happen after check above):
  if (PURE_ASCII_AMBIGUOUS.has(lang2) && effectivelyAscii) return "und";

  return lang2;
}
