export type Translation = {
  title: string;
  description: string | null;
  pollOptions: string[] | null;
};

// Module-level cache shared across all pages.
// Cache key: `${questionId}:${targetLang}`
export const translationCache = new Map<string, Translation>();
