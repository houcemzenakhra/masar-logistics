/**
 * Sorting lanes on a hub's floor. A parcel scanned in goes to the lane of the hub it travels to
 * next, or, for local delivery, the lane of its commune, or the stop desk lane.
 */
import { and, asc, eq, ne } from "drizzle-orm";
import type { Q } from "../db";
import { communes, hubs, sortZones, wilayas } from "../schema";

export class SortingError extends Error {}

export const listZones = (q: Q, hubId: string) => q.select().from(sortZones).where(eq(sortZones.hubId, hubId)).orderBy(asc(sortZones.code));

export async function createZone(q: Q, z: { hubId: string; code: string; name: string; communeIds?: number[]; destHubIds?: string[]; desk?: boolean }) {
  const code = z.code.trim().toUpperCase().slice(0, 6);
  if (!/^[A-Z0-9-]{1,6}$/.test(code)) throw new SortingError("A lane code is up to 6 letters or digits, e.g. A1");
  const existing = await listZones(q, z.hubId);
  if (existing.some((e) => e.code === code)) throw new SortingError(`Lane ${code} already exists`);
  const communeIds = [...new Set(z.communeIds ?? [])];
  const destHubIds = [...new Set(z.destHubIds ?? [])].filter((h) => h !== z.hubId);
  if (!communeIds.length && !destHubIds.length && !z.desk) throw new SortingError("Choose what goes in this lane: communes, hubs or the stop desk");
  // A commune or hub in two lanes would leave the scanner guessing.
  const taken = existing.flatMap((e) => [...e.communeIds.filter((c) => communeIds.includes(c)).map(() => e.code), ...e.destHubIds.filter((h) => destHubIds.includes(h)).map(() => e.code)]);
  if (taken.length) throw new SortingError(`Some of these are already in lane ${taken[0]}`);
  if (z.desk && existing.some((e) => e.desk)) throw new SortingError("The stop desk already has a lane");
  const [row] = await q.insert(sortZones).values({ hubId: z.hubId, code, name: z.name.trim().slice(0, 60) || code, communeIds, destHubIds, desk: !!z.desk }).returning();
  return row;
}

export async function deleteZone(q: Q, hubId: string, id: string) {
  const [row] = await q.delete(sortZones).where(and(eq(sortZones.id, id), eq(sortZones.hubId, hubId))).returning();
  if (!row) throw new SortingError("Lane not found");
  return row;
}

const bearing = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180) / Math.PI + 180;

/**
 * A first set of lanes for a hub with none: one per other hub (L1, L2…), the stop desk (SD), and
 * the hub's own communes in up to six lanes (A to F) by direction from the hub, like slices of a
 * pie, so each courier run takes one or two lanes. The stop desk lane is SD.
 */
export async function suggestZones(q: Q, hubId: string) {
  if ((await listZones(q, hubId)).length) throw new SortingError("This hub already has lanes. Remove them first to start again.");
  const [hub] = await q.select().from(hubs).where(eq(hubs.id, hubId));
  if (!hub) throw new SortingError("Hub not found");
  const others = await q.select({ id: hubs.id, name: hubs.name }).from(hubs).where(ne(hubs.id, hubId)).orderBy(asc(hubs.name));
  const local = await q
    .select({ id: communes.id, name: communes.name, lat: communes.lat, lng: communes.lng, wilaya: wilayas.name })
    .from(communes)
    .innerJoin(wilayas, eq(communes.wilayaId, wilayas.id))
    .where(eq(wilayas.hubId, hubId));
  const centre = hub.lat != null && hub.lng != null ? { lat: hub.lat, lng: hub.lng } : local[0];
  const sorted = [...local].sort((a, b) => bearing(centre, a) - bearing(centre, b));
  const groups = Math.min(6, Math.max(1, Math.ceil(sorted.length / 25)));
  const size = Math.ceil(sorted.length / groups);
  const made = [];
  for (let g = 0; g < groups; g++) {
    const part = sorted.slice(g * size, (g + 1) * size);
    if (!part.length) continue;
    // Named after the wilayas it covers, most communes first: "Alger, Boumerdès".
    const counts = new Map<string, number>();
    for (const c of part) counts.set(c.wilaya, (counts.get(c.wilaya) ?? 0) + 1);
    const names = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([w]) => w);
    const name = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
    made.push(await createZone(q, { hubId, code: String.fromCharCode(65 + g), name, communeIds: part.map((c) => c.id) }));
  }
  made.push(await createZone(q, { hubId, code: "SD", name: "Stop desk", desk: true }));
  for (let i = 0; i < others.length; i++) made.push(await createZone(q, { hubId, code: `L${i + 1}`, name: `→ ${others[i].name}`, destHubIds: [others[i].id] }));
  return made;
}

/** The lane a parcel goes to at this hub, or null when no lane covers it. */
export async function zoneFor(q: Q, hubId: string, p: { destHubId: string; communeId: number | null; deliveryType: string; status?: string }) {
  const zones = await listZones(q, hubId);
  if (!zones.length) return null;
  // Leaving this hub (or a return heading back): the lane of the next hub.
  if (p.destHubId !== hubId) return zones.find((z) => z.destHubIds.includes(p.destHubId)) ?? null;
  if (p.deliveryType === "desk") return zones.find((z) => z.desk) ?? null;
  return (p.communeId && zones.find((z) => z.communeIds.includes(p.communeId!))) || null;
}
