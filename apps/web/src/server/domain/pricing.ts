/** Rate calculation. Pure, so the public calculator can run it in the browser. */

export type TierKey = "local" | "north" | "highlands" | "south";
export type Tier = { key: TierKey; label: string; base: number; perExtraKg: number; returnFee: number };

export const INCLUDED_KG = 5;
const ZONE_TIER: Record<number, TierKey> = { 1: "north", 2: "highlands", 3: "south" };

export function tierFor(origin: { id: number; zone: number }, dest: { id: number; zone: number }): TierKey {
  if (origin.id === dest.id) return "local";
  return ZONE_TIER[Math.max(origin.zone, dest.zone)] ?? "south";
}

export function quote(tier: Tier, weightKg: number) {
  const extraKg = Math.max(0, Math.ceil(weightKg) - INCLUDED_KG);
  return {
    tier: tier.key,
    deliveryFee: tier.base + extraKg * tier.perExtraKg,
    returnFee: tier.returnFee,
  };
}

/** Length × width × height in cm divided by this gives a weight in kg. Couriers' usual figure. */
export const DEFAULT_VOLUME_DIVISOR = 5000;
export type Size = { lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null };

/**
 * The weight a parcel is charged for: its real weight, or its volume weight when that is more, so
 * a large light box pays for the room it takes. `divisor` 0 turns volume pricing off.
 */
export function chargeableKg(weightKg: number, size: Size | null | undefined, divisor = DEFAULT_VOLUME_DIVISOR) {
  const { lengthCm: l, widthCm: w, heightCm: h } = size ?? {};
  const volume = divisor > 0 && l && w && h ? (l * w * h) / divisor : 0;
  return Math.ceil(Math.max(weightKg, volume));
}

/** Reads "30x20x10", "30 × 20 × 10" or "30*20*10" (cm). */
export function parseSize(s: string): Size | null {
  const m = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i.exec(s);
  if (!m) return null;
  const [l, w, h] = m.slice(1).map((v) => Math.ceil(Number(v.replace(",", "."))));
  return { lengthCm: l, widthCm: w, heightCm: h };
}

export const dzd = (n: number) => `${new Intl.NumberFormat("en-US").format(n)} DZD`;
