const RTL_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

export function isRtlText(text: string | undefined | null): boolean {
  if (!text) return false;
  return RTL_REGEX.test(text);
}

export function rtlAttrs(text: string | undefined | null): { dir?: "rtl"; style?: { textAlign: "right" } } {
  if (!isRtlText(text)) return {};
  return { dir: "rtl", style: { textAlign: "right" } };
}
