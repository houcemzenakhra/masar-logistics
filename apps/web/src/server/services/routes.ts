import { and, eq } from "drizzle-orm";
import type { Q } from "../db";
import { optimise, type Stop } from "../domain/route";
import { communes, hubs, parcels, users } from "../schema";
import { DomainError } from "./parcels";

/**
 * Orders a courier's deliveries into a short route starting from their hub and saves the order.
 * Parcels are placed at the centre of their commune, so parcels in the same commune stay together;
 * the order inside one commune is left to the courier. Parcels with no commune on file go last.
 */
export async function optimiseCourierRoute(q: Q, courierId: string) {
  return q.transaction(async (tx) => {
    const [courier] = await tx
      .select({ id: users.id, lat: hubs.lat, lng: hubs.lng })
      .from(users)
      .leftJoin(hubs, eq(users.hubId, hubs.id))
      .where(and(eq(users.id, courierId), eq(users.role, "courier")));
    if (!courier) throw new DomainError("Unknown courier");

    const rows = await tx
      .select({ id: parcels.id, communeId: parcels.communeId, lat: communes.lat, lng: communes.lng })
      .from(parcels)
      .leftJoin(communes, eq(parcels.communeId, communes.id))
      .where(and(eq(parcels.courierId, courierId), eq(parcels.status, "out_for_delivery")))
      .orderBy(parcels.tracking);

    const stops = new Map<number, Stop>();
    for (const r of rows) if (r.communeId && r.lat !== null && r.lng !== null) stops.set(r.communeId, { id: r.communeId, lat: r.lat, lng: r.lng });
    const list = [...stops.values()];
    if (list.length === 0) return { parcels: rows.length, stops: 0, km: 0 };

    // Without hub coordinates, start from the first commune rather than guessing.
    const start = courier.lat !== null && courier.lng !== null ? { lat: courier.lat, lng: courier.lng } : list[0];
    const { order, km } = optimise(start, list);
    const rank = new Map(order.map((s, i) => [s.id as number, i]));
    const sorted = [...rows].sort((a, b) => (rank.get(a.communeId ?? -1) ?? 1e9) - (rank.get(b.communeId ?? -1) ?? 1e9));
    for (let i = 0; i < sorted.length; i++) await tx.update(parcels).set({ routeSeq: i + 1 }).where(eq(parcels.id, sorted[i].id));
    return { parcels: rows.length, stops: order.length, km: Math.round(km) };
  });
}
