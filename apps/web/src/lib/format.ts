import { locale, t } from "@/lib/i18n";

/** Western digits in every language: that is what Algerian invoices, labels and banks use. */
export const money = (n: number) => new Intl.NumberFormat("en-US").format(n);

const TAG = { en: "en-GB", fr: "fr-FR", ar: "ar-DZ" } as const;
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(TAG[locale()], { ...o, timeZone: "Africa/Algiers", numberingSystem: "latn" });

export const dateTime = (v: Date | string) => fmt({ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
export const dateOnly = (v: Date | string) => fmt({ day: "2-digit", month: "short", year: "numeric" }).format(new Date(v));
export const timeOnly = (v: Date | string) => fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(v));

/**
 * A one-hour window around an expected time, on quarter hours: 10:40 gives 10:15 to 11:15. Never
 * starts before now, so a late courier is not shown as already past.
 */
export function etaWindow(eta: Date | string, now = new Date()) {
  const q = 15 * 60_000;
  const from = Math.max(Math.floor((new Date(eta).getTime() - 25 * 60_000) / q) * q, Math.ceil(now.getTime() / q) * q);
  return { from: timeOnly(new Date(from)), to: timeOnly(new Date(from + 60 * 60_000)) };
}

/** A YYYY-MM-DD day with its weekday, e.g. "Sunday 22 Nov". Read at noon so no time zone moves it. */
export const dayName = (day: string) => fmt({ weekday: "long", day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00Z`));

export function ago(v: Date | string) {
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 3600) return t("{n} min ago", { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return t("{n} h ago", { n: Math.round(s / 3600) });
  return t("{n} d ago", { n: Math.round(s / 86400) });
}
