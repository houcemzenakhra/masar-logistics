import { and, eq } from "drizzle-orm";
import type { Q } from "../db";
import { km, optimiseMatrix, type Point } from "../domain/route";
import { communes, hubs, parcels, users } from "../schema";
import { DomainError } from "./parcels";

/** Without a road router: straight lines lengthened by this factor, at this average speed. */
const ROAD_FACTOR = 1.35;
const SPEED_KMH = 28;
/** Minutes at each door: finding the building, the cash, the code. */
export const MINUTES_PER_PARCEL = 6;
/** Couriers leave the hub at this time, Algeria time, when routes are planned earlier. */
const START = { h: 8, m: 30 };

type Matrix = { seconds: number[][]; meters: number[][]; source: "osrm" | "estimate" };

function estimate(points: Point[]): Matrix {
  const meters = points.map((a) => points.map((b) => km(a, b) * ROAD_FACTOR * 1000));
  return { meters, seconds: meters.map((row) => row.map((m) => (m / 1000 / SPEED_KMH) * 3600)), source: "estimate" };
}

/**
 * Travel times between points by road, from an OSRM server (`OSRM_URL`, e.g. a self-hosted
 * router with the Algeria map). Falls back to straight-line estimates when it is not set, slow
 * (over 5 s) or answers anything unexpected, so planning never fails because of the router.
 */
export async function travelMatrix(points: Point[]): Promise<Matrix> {
  const base = process.env.OSRM_URL?.replace(/\/$/, "");
  if (!base || points.length < 2 || points.length > 100) return estimate(points);
  try {
    const coords = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
    const res = await fetch(`${base}/table/v1/driving/${coords}?annotations=duration,distance`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return estimate(points);
    const j = (await res.json()) as { code?: string; durations?: (number | null)[][]; distances?: (number | null)[][] };
    if (j.code !== "Ok" || !j.durations || !j.distances) return estimate(points);
    const est = estimate(points);
    // A pair the router cannot join (an island, a missing road) keeps the estimate.
    return {
      seconds: j.durations.map((row, i) => row.map((v, k) => v ?? est.seconds[i][k])),
      meters: j.distances.map((row, i) => row.map((v, k) => v ?? est.meters[i][k])),
      source: "osrm",
    };
  } catch {
    return estimate(points);
  }
}

/** When the run starts: now, or 8:30 Algeria time if it is earlier than that. */
function runStart(now: Date) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(now);
  const opening = new Date(`${day}T${String(START.h).padStart(2, "0")}:${String(START.m).padStart(2, "0")}:00+01:00`);
  return now > opening ? now : opening;
}

/**
 * Orders a courier's deliveries into a short route from their hub, by road time when a router
 * is configured, saves the order, and gives each parcel an expected time at the door. Parcels
 * sit at the centre of their commune, so parcels in one commune stay together.
 */
export async function optimiseCourierRoute(q: Q, courierId: string, now = new Date()) {
  {
    const tx = q;
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

    const stops = new Map<number, Point & { id: number }>();
    for (const r of rows) if (r.communeId && r.lat !== null && r.lng !== null) stops.set(r.communeId, { id: r.communeId, lat: r.lat, lng: r.lng });
    const list = [...stops.values()];
    if (list.length === 0) return { parcels: rows.length, stops: 0, km: 0, minutes: 0, source: "estimate" as const };

    // Without hub coordinates, start from the first commune rather than guessing.
    const start = courier.lat !== null && courier.lng !== null ? { lat: courier.lat, lng: courier.lng } : list[0];
    // Asked before any write, so no database transaction waits on the router.
    const matrix = await travelMatrix([start, ...list]);
    const { order } = optimiseMatrix(matrix.seconds);
    const plan: { id: string; routeSeq: number; eta: Date | null }[] = [];

    // Walk the route: drive to each stop, then spend a few minutes per parcel there.
    const byCommune = new Map<number, typeof rows>();
    for (const r of rows) if (r.communeId && stops.has(r.communeId)) byCommune.set(r.communeId, [...(byCommune.get(r.communeId) ?? []), r]);
    let t = runStart(now).getTime();
    let meters = 0;
    let at = 0;
    let seq = 0;
    for (const idx of order) {
      t += matrix.seconds[at][idx] * 1000;
      meters += matrix.meters[at][idx];
      at = idx;
      for (const r of byCommune.get(list[idx - 1].id) ?? []) {
        t += MINUTES_PER_PARCEL * 60_000;
        plan.push({ id: r.id, routeSeq: ++seq, eta: new Date(t) });
      }
    }
    // Parcels with no commune on file go last, with no time promised.
    for (const r of rows.filter((x) => !x.communeId || !stops.has(x.communeId))) plan.push({ id: r.id, routeSeq: ++seq, eta: null });
    await q.transaction(async (w) => {
      for (const p of plan) await w.update(parcels).set({ routeSeq: p.routeSeq, eta: p.eta }).where(eq(parcels.id, p.id));
    });
    return { parcels: rows.length, stops: order.length, km: Math.round(meters / 1000), minutes: Math.round((t - runStart(now).getTime()) / 60_000), source: matrix.source };
  }
}
