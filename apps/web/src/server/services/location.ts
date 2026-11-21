/** Where couriers are: the latest position for the live map, and a short trail. */
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Q } from "../db";
import { communes, courierPositions, courierTrail, hubs, parcels, users } from "../schema";
import { DomainError } from "./parcels";

export type Point = { lat: number; lng: number; accuracy?: number; heading?: number; speed?: number; at: Date };

/** Inside Algeria, with a margin. Anything else is a bad fix or a test value. */
const inAlgeria = (p: Point) => p.lat > 18 && p.lat < 38 && p.lng > -9.5 && p.lng < 12.5;

/**
 * Records positions sent by the courier app, possibly a batch saved while offline. Fixes outside
 * Algeria, in the future or older than a day are skipped. The trail keeps three days.
 */
export async function recordPositions(q: Q, courierId: string, points: Point[]) {
  const now = Date.now();
  const good = points
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && inAlgeria(p))
    .filter((p) => p.at.getTime() <= now + 2 * 60_000 && p.at.getTime() > now - 24 * 3600_000)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(-500);
  if (!good.length) return 0;
  const last = good[good.length - 1];
  await q
    .insert(courierPositions)
    .values({ courierId, lat: last.lat, lng: last.lng, accuracy: last.accuracy ?? null, heading: last.heading ?? null, speed: last.speed ?? null, at: last.at })
    .onConflictDoUpdate({
      target: courierPositions.courierId,
      set: { lat: last.lat, lng: last.lng, accuracy: last.accuracy ?? null, heading: last.heading ?? null, speed: last.speed ?? null, at: last.at },
      // A late batch from an offline phone must not move the marker back in time.
      setWhere: lt(courierPositions.at, last.at),
    });
  await q.insert(courierTrail).values(good.map((p) => ({ courierId, lat: p.lat, lng: p.lng, at: p.at })));
  if (Math.random() < 0.02) await q.delete(courierTrail).where(lt(courierTrail.at, new Date(now - 3 * 24 * 3600_000)));
  return good.length;
}

/** Couriers with a position in the last 12 hours, for the operations map. */
export async function livePositions(q: Q, hubId?: string | null) {
  const since = new Date(Date.now() - 12 * 3600_000);
  return q
    .select({
      courierId: users.id,
      name: users.name,
      phone: users.phone,
      hub: hubs.name,
      hubId: users.hubId,
      lat: courierPositions.lat,
      lng: courierPositions.lng,
      accuracy: courierPositions.accuracy,
      speed: courierPositions.speed,
      at: courierPositions.at,
      deliveries: sql<number>`(select count(*)::int from parcels p where p.courier_id = ${users.id} and p.status = 'out_for_delivery')`,
      pickups: sql<number>`(select count(*)::int from parcels p where p.courier_id = ${users.id} and p.status = 'pickup_assigned')`,
    })
    .from(courierPositions)
    .innerJoin(users, eq(courierPositions.courierId, users.id))
    .leftJoin(hubs, eq(users.hubId, hubs.id))
    .where(and(gt(courierPositions.at, since), eq(users.active, true), hubId ? eq(users.hubId, hubId) : undefined));
}

/** Today's trail for one courier. */
export const trail = (q: Q, courierId: string, hours = 12) =>
  q
    .select({ lat: courierTrail.lat, lng: courierTrail.lng, at: courierTrail.at })
    .from(courierTrail)
    .where(and(eq(courierTrail.courierId, courierId), gt(courierTrail.at, new Date(Date.now() - hours * 3600_000))))
    .orderBy(courierTrail.at)
    .limit(2000);

/** Stops of a courier's delivery run, with coordinates, for the map. */
export async function runStops(q: Q, courierId: string) {
  return q
    .select({ id: parcels.id, tracking: parcels.tracking, seq: parcels.routeSeq, status: parcels.status, recipient: parcels.recipientName, lat: communes.lat, lng: communes.lng })
    .from(parcels)
    .leftJoin(communes, eq(parcels.communeId, communes.id))
    .where(and(eq(parcels.courierId, courierId), inArray(parcels.status, ["out_for_delivery", "pickup_assigned"])))
    .orderBy(sql`${parcels.routeSeq} asc nulls last`);
}

/**
 * What a recipient may see: only while their parcel is out for delivery, only if the courier's
 * position is fresh, rounded to about 100 m, with how many stops come before theirs.
 */
export async function publicLive(q: Q, tracking: string) {
  const [p] = await q.select().from(parcels).where(eq(parcels.tracking, tracking.trim().toUpperCase()));
  if (!p || p.status !== "out_for_delivery" || !p.courierId) return null;
  const [pos] = await q.select().from(courierPositions).where(eq(courierPositions.courierId, p.courierId));
  const [c] = await q.select({ name: users.name }).from(users).where(eq(users.id, p.courierId));
  const [{ before }] = await q
    .select({ before: sql<number>`count(*)::int` })
    .from(parcels)
    .where(and(eq(parcels.courierId, p.courierId), eq(parcels.status, "out_for_delivery"), p.routeSeq != null ? lt(parcels.routeSeq, p.routeSeq) : sql`false`));
  const fresh = pos && Date.now() - pos.at.getTime() < 20 * 60_000;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    courier: c?.name.split(" ")[0] ?? "",
    stopsBefore: before,
    position: fresh ? { lat: round(pos.lat), lng: round(pos.lng), at: pos.at } : null,
  };
}

export function parsePoints(raw: unknown): Point[] {
  if (!Array.isArray(raw)) throw new DomainError("points must be a list");
  return raw.slice(0, 500).map((r) => {
    const o = r as Record<string, unknown>;
    return {
      lat: Number(o.lat),
      lng: Number(o.lng),
      accuracy: o.accuracy == null ? undefined : Number(o.accuracy),
      heading: o.heading == null ? undefined : Number(o.heading),
      speed: o.speed == null ? undefined : Number(o.speed),
      at: o.at ? new Date(String(o.at)) : new Date(),
    };
  });
}
