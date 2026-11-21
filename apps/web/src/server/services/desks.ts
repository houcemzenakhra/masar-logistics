/** Stop desks: counters run by a hub where recipients collect parcels themselves. */
import { and, asc, eq } from "drizzle-orm";
import type { Q } from "../db";
import { communes, hubs, settings, stopDesks, wilayas } from "../schema";

export class DeskError extends Error {}

export type DeskSettings = {
  /** Taken off the home-delivery fee when the recipient collects at a desk, in DZD. */
  discount: number;
};
const DEFAULTS: DeskSettings = { discount: 150 };
/** A desk delivery never costs less than this, whatever the discount. */
export const MIN_DESK_FEE = 200;

export async function getDeskSettings(q: Q): Promise<DeskSettings> {
  const [r] = await q.select().from(settings).where(eq(settings.key, "desks"));
  return { ...DEFAULTS, ...((r?.value ?? {}) as Partial<DeskSettings>) };
}

export async function setDeskSettings(q: Q, v: DeskSettings) {
  if (!Number.isInteger(v.discount) || v.discount < 0 || v.discount > 2000) throw new DeskError("The discount must be between 0 and 2,000 DZD");
  await q.insert(settings).values({ key: "desks", value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}

/** Fee for collecting at a desk: the home-delivery fee minus the discount, with a floor. */
export const deskFee = (homeFee: number, s: DeskSettings) => Math.max(Math.min(homeFee, MIN_DESK_FEE), homeFee - s.discount);

export function listDesks(q: Q, f: { wilayaId?: number; hubId?: string; activeOnly?: boolean } = {}) {
  const where = [];
  if (f.wilayaId) where.push(eq(stopDesks.wilayaId, f.wilayaId));
  if (f.hubId) where.push(eq(stopDesks.hubId, f.hubId));
  if (f.activeOnly) where.push(eq(stopDesks.active, true));
  return q
    .select({
      id: stopDesks.id,
      code: stopDesks.code,
      name: stopDesks.name,
      address: stopDesks.address,
      phone: stopDesks.phone,
      hours: stopDesks.hours,
      active: stopDesks.active,
      hubId: stopDesks.hubId,
      hub: hubs.name,
      wilayaId: stopDesks.wilayaId,
      wilaya: wilayas.name,
      wilayaAr: wilayas.nameAr,
      communeId: stopDesks.communeId,
      commune: communes.name,
      communeAr: communes.nameAr,
      lat: stopDesks.lat,
      lng: stopDesks.lng,
    })
    .from(stopDesks)
    .innerJoin(hubs, eq(stopDesks.hubId, hubs.id))
    .innerJoin(wilayas, eq(stopDesks.wilayaId, wilayas.id))
    .leftJoin(communes, eq(stopDesks.communeId, communes.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(stopDesks.wilayaId), asc(stopDesks.name));
}

export type DeskView = Awaited<ReturnType<typeof listDesks>>[number];

export type NewDesk = { name: string; wilayaId: number; communeId?: number; address: string; phone?: string; hours?: string };

/**
 * Opens a desk in a wilaya. The desk is run by the hub that serves the wilaya, and sits at the
 * centre of its commune on the map until someone gives it exact coordinates.
 */
export async function createDesk(q: Q, d: NewDesk) {
  const name = d.name.trim();
  const address = d.address.trim();
  if (name.length < 3) throw new DeskError("Give the desk a name");
  if (address.length < 5) throw new DeskError("Enter the desk's address, so recipients can find it");
  const [w] = await q.select().from(wilayas).where(eq(wilayas.id, d.wilayaId));
  if (!w) throw new DeskError("Choose a wilaya");
  let lat: number | null = null;
  let lng: number | null = null;
  if (d.communeId) {
    const [c] = await q.select().from(communes).where(eq(communes.id, d.communeId));
    if (!c || c.wilayaId !== w.id) throw new DeskError("That commune is not in the chosen wilaya");
    lat = c.lat;
    lng = c.lng;
  }
  const code = `SD-${String(w.id).padStart(2, "0")}-${crypto.getRandomValues(new Uint16Array(1))[0].toString(36).toUpperCase().padStart(3, "0")}`;
  const [row] = await q
    .insert(stopDesks)
    .values({ code, name, wilayaId: w.id, hubId: w.hubId, communeId: d.communeId ?? null, address, phone: d.phone?.trim() ?? "", hours: d.hours?.trim().slice(0, 60) ?? "", lat, lng })
    .returning();
  return row;
}

export async function setDeskActive(q: Q, id: string, active: boolean) {
  const [row] = await q.update(stopDesks).set({ active }).where(eq(stopDesks.id, id)).returning();
  if (!row) throw new DeskError("Stop desk not found");
  return row;
}
