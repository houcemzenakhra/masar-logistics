import { locale, t } from "@/lib/i18n";

/** Western digits in every language: that is what Algerian invoices, labels and banks use. */
export const money = (n: number) => new Intl.NumberFormat("en-US").format(n);

const TAG = { en: "en-GB", fr: "fr-FR", ar: "ar-DZ" } as const;
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(TAG[locale()], { ...o, timeZone: "Africa/Algiers", numberingSystem: "latn" });

export const dateTime = (v: Date | string) => fmt({ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
export const dateOnly = (v: Date | string) => fmt({ day: "2-digit", month: "short", year: "numeric" }).format(new Date(v));

export function ago(v: Date | string) {
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 3600) return t("{n} min ago", { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return t("{n} h ago", { n: Math.round(s / 3600) });
  return t("{n} d ago", { n: Math.round(s / 86400) });
}
