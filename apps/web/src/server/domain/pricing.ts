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

export const dzd = (n: number) => `${new Intl.NumberFormat("en-US").format(n)} DZD`;
