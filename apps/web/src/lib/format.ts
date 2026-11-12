export const money = (n: number) => new Intl.NumberFormat("en-US").format(n);

const dt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });
const d = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Algiers" });

export const dateTime = (v: Date | string) => dt.format(new Date(v));
export const dateOnly = (v: Date | string) => d.format(new Date(v));

export function ago(v: Date | string) {
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
