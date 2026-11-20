/** Algerian phone numbers. Pure functions. */

/**
 * Turns what people type or paste (spaces, dots, +213, 00213, a spreadsheet number that lost its
 * leading zero) into the national form `0550 12 34 56`. Returns null when it is not a mobile number.
 */
export function normalizeMobile(raw: unknown): string | null {
  let d = String(raw ?? "").trim().replace(/[\s.\-()/]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("213")) d = `0${d.slice(3)}`;
  if (/^[567]\d{8}$/.test(d)) d = `0${d}`;
  if (!/^0[567]\d{8}$/.test(d)) return null;
  return `${d.slice(0, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

/** `0550 12 34 56` → `+213550123456`, the form SMS gateways expect. */
export function toE164(national: string): string | null {
  const n = normalizeMobile(national);
  return n ? `+213${n.replace(/\s/g, "").slice(1)}` : null;
}

/** For messages shown to staff: `0550 •• •• 56`. */
export const maskPhone = (n: string) => n.replace(/^(\d{4}) \d{2} \d{2} (\d{2})$/, "$1 •• •• $2");
