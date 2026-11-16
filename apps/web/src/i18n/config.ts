export const LOCALES = ["en", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "masar_locale";
export const LOCALE_NAME: Record<Locale, string> = { en: "English", fr: "Français", ar: "العربية" };
export const isRtl = (l: Locale) => l === "ar";
export type Dict = Record<string, string>;

/** English text is the key. A missing entry falls back to the English text itself. */
export function translate(dict: Dict | undefined, text: string, vars?: Record<string, string | number>): string {
  let out = dict?.[text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}
