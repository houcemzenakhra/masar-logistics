import { cookies, headers } from "next/headers";
import { cache } from "react";
import { ar } from "@/i18n/ar";
import { LOCALES, LOCALE_COOKIE, translate, type Dict, type Locale } from "@/i18n/config";
import { fr } from "@/i18n/fr";

export const DICTS: Record<Locale, Dict | undefined> = { en: undefined, fr, ar };

// One slot per request. `initLocale` fills it; the synchronous helpers below read it.
const slot = cache(() => ({ locale: "en" as Locale }));

const resolve = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value as Locale | undefined;
  if (saved && LOCALES.includes(saved)) return saved;
  // First visit: follow the browser's language list.
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.trim().slice(0, 2).toLowerCase() as Locale;
    if (LOCALES.includes(tag)) return tag;
  }
  return "en";
});

/**
 * Call (and await) once at the top of every page, layout and server action.
 * After that, `t()` and `locale()` work synchronously in everything that page renders.
 */
export async function initLocale(): Promise<Locale> {
  const l = await resolve();
  slot().locale = l;
  return l;
}

/** For server actions and route handlers: a translator bound to the visitor's language. */
export async function getT() {
  const l = await initLocale();
  return (text: string, vars?: Record<string, string | number>) => translate(DICTS[l], text, vars);
}

export const locale = (): Locale => slot().locale;

export const t = (text: string, vars?: Record<string, string | number>) => {
  const d = DICTS[slot().locale];
  if (d && !(text in d) && process.env.MASAR_I18N_LOG) logMissing(text);
  return translate(d, text, vars);
};

/** Development aid: with MASAR_I18N_LOG=<file>, untranslated strings are appended to that file. */
const seen = new Set<string>();
function logMissing(text: string) {
  if (seen.has(text)) return;
  seen.add(text);
  import("node:fs").then((fs) => fs.appendFileSync(process.env.MASAR_I18N_LOG!, `${JSON.stringify(text)}\n`));
}

/** Place names are stored in French and Arabic. */
export const place = (name: string, nameAr?: string | null) => (slot().locale === "ar" && nameAr ? nameAr : name);
