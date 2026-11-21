/**
 * Numbers for running the network: volumes, how often parcels reach the door, how fast, and where
 * they do not. Parcels are counted in the period they were ordered; return parcels are left out.
 */
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { Q } from "../db";
import { merchants, parcelEvents, parcels, users, wilayas } from "../schema";

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

const since = (days: number) => new Date(Date.now() - days * 86400_000);

/** Ordered in the period, real deliveries only, optionally for one merchant. */
const scope = (days: number, merchantId?: string | null) =>
  and(gte(parcels.createdAt, since(days)), eq(parcels.kind, "delivery"), merchantId ? eq(parcels.merchantId, merchantId) : undefined);

const DONE = sql`${parcels.status} in ('delivered', 'returned', 'return_initiated')`;

/** Share as a whole percentage, or null when nothing is finished yet. */
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export async function overview(q: Q, days: number, merchantId?: string | null) {
  const [r] = await q
    .select({
      orders: sql<number>`count(*)::int`,
      cancelled: sql<number>`count(*) filter (where ${parcels.status} = 'cancelled')::int`,
      delivered: sql<number>`count(*) filter (where ${parcels.status} = 'delivered')::int`,
      returned: sql<number>`count(*) filter (where ${parcels.status} in ('returned', 'return_initiated'))::int`,
      firstTry: sql<number>`count(*) filter (where ${parcels.status} = 'delivered' and ${parcels.attempts} = 1)::int`,
      inProgress: sql<number>`count(*) filter (where ${parcels.status} not in ('delivered', 'returned', 'return_initiated', 'cancelled', 'lost'))::int`,
      lost: sql<number>`count(*) filter (where ${parcels.status} = 'lost')::int`,
      hours: sql<number>`coalesce(avg(extract(epoch from (${parcels.deliveredAt} - ${parcels.createdAt})) / 3600) filter (where ${parcels.status} = 'delivered'), 0)::float`,
      cash: sql<number>`coalesce(sum(coalesce(${parcels.collectedAmount}, ${parcels.codAmount})) filter (where ${parcels.status} = 'delivered'), 0)::int`,
      fees: sql<number>`(coalesce(sum(${parcels.deliveryFee}) filter (where ${parcels.status} = 'delivered'), 0) + coalesce(sum(${parcels.returnFee}) filter (where ${parcels.status} = 'returned'), 0))::int`,
      rating: sql<number | null>`avg(${parcels.rating})::float`,
      ratings: sql<number>`count(${parcels.rating})::int`,
    })
    .from(parcels)
    .where(scope(days, merchantId));
  const finished = r.delivered + r.returned;
  return { ...r, finished, successRate: pct(r.delivered, finished), firstTryRate: pct(r.firstTry, r.delivered), hours: Math.round(r.hours) };
}

/** Per destination wilaya, busiest first. */
export async function byWilaya(q: Q, days: number, merchantId?: string | null) {
  const rows = await q
    .select({
      id: wilayas.id,
      name: wilayas.name,
      nameAr: wilayas.nameAr,
      orders: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) filter (where ${parcels.status} = 'delivered')::int`,
      finished: sql<number>`count(*) filter (where ${DONE})::int`,
      refused: sql<number>`count(*) filter (where ${parcels.failReason} = 'refused' and ${parcels.status} in ('returned', 'return_initiated'))::int`,
      hours: sql<number>`coalesce(avg(extract(epoch from (${parcels.deliveredAt} - ${parcels.createdAt})) / 3600) filter (where ${parcels.status} = 'delivered'), 0)::float`,
    })
    .from(parcels)
    .innerJoin(wilayas, eq(parcels.destWilayaId, wilayas.id))
    .where(scope(days, merchantId))
    .groupBy(wilayas.id, wilayas.name, wilayas.nameAr)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ ...r, successRate: pct(r.delivered, r.finished), hours: Math.round(r.hours) }));
}

/** Per courier: the deliveries and failed attempts they recorded in the period. */
export async function byCourier(q: Q, days: number) {
  const out = await q
    .select({
      id: users.id,
      name: users.name,
      delivered: sql<number>`count(*) filter (where ${parcelEvents.status} = 'delivered')::int`,
      failed: sql<number>`count(*) filter (where ${parcelEvents.status} = 'attempt_failed')::int`,
    })
    .from(parcelEvents)
    .innerJoin(users, eq(users.id, parcelEvents.actorId))
    .where(and(gte(parcelEvents.createdAt, since(days)), eq(users.role, "courier"), sql`${parcelEvents.status} in ('delivered', 'attempt_failed')`))
    .groupBy(users.id, users.name);
  const ratings = await q
    .select({ id: parcels.courierId, rating: sql<number>`avg(${parcels.rating})::float`, n: sql<number>`count(${parcels.rating})::int` })
    .from(parcels)
    .where(and(gte(parcels.deliveredAt, since(days)), isNotNull(parcels.rating)))
    .groupBy(parcels.courierId);
  return out
    .map((c) => {
      const r = ratings.find((x) => x.id === c.id);
      return { ...c, attempts: c.delivered + c.failed, successRate: pct(c.delivered, c.delivered + c.failed), rating: r?.rating ?? null, ratings: r?.n ?? 0 };
    })
    .sort((a, b) => b.attempts - a.attempts);
}

/** Per merchant: volume and how often their parcels come back. */
export async function byMerchant(q: Q, days: number) {
  const rows = await q
    .select({
      id: merchants.id,
      name: merchants.name,
      orders: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) filter (where ${parcels.status} = 'delivered')::int`,
      returned: sql<number>`count(*) filter (where ${parcels.status} in ('returned', 'return_initiated'))::int`,
      fees: sql<number>`(coalesce(sum(${parcels.deliveryFee}) filter (where ${parcels.status} = 'delivered'), 0) + coalesce(sum(${parcels.returnFee}) filter (where ${parcels.status} = 'returned'), 0))::int`,
    })
    .from(parcels)
    .innerJoin(merchants, eq(parcels.merchantId, merchants.id))
    .where(scope(days))
    .groupBy(merchants.id, merchants.name)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ ...r, returnRate: pct(r.returned, r.delivered + r.returned) }));
}

/** Why deliveries failed, from every failed attempt in the period. */
export async function failureReasons(q: Q, days: number, merchantId?: string | null) {
  // The reason is the first part of the event note ("Recipient not answering: …").
  return q
    .select({ reason: sql<string>`split_part(${parcelEvents.note}, ':', 1)`, n: sql<number>`count(*)::int` })
    .from(parcelEvents)
    .innerJoin(parcels, eq(parcelEvents.parcelId, parcels.id))
    .where(and(eq(parcelEvents.status, "attempt_failed"), gte(parcelEvents.createdAt, since(days)), merchantId ? eq(parcels.merchantId, merchantId) : undefined))
    .groupBy(sql`split_part(${parcelEvents.note}, ':', 1)`)
    .orderBy(desc(sql`count(*)`));
}

/** Orders and deliveries per day, oldest first, with empty days included. */
export async function daily(q: Q, days: number, merchantId?: string | null) {
  const rows = await q
    .select({
      day: sql<string>`to_char(${parcelEvents.createdAt} at time zone 'Africa/Algiers', 'YYYY-MM-DD')`,
      created: sql<number>`count(*) filter (where ${parcelEvents.status} = 'created' and ${parcelEvents.note} = 'Order created')::int`,
      delivered: sql<number>`count(*) filter (where ${parcelEvents.status} = 'delivered')::int`,
    })
    .from(parcelEvents)
    .innerJoin(parcels, eq(parcelEvents.parcelId, parcels.id))
    .where(and(gte(parcelEvents.createdAt, since(days)), eq(parcels.kind, "delivery"), merchantId ? eq(parcels.merchantId, merchantId) : undefined))
    .groupBy(sql`1`);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" });
  return Array.from({ length: days }, (_, i) => {
    const day = fmt.format(new Date(Date.now() - (days - 1 - i) * 86400_000));
    const r = rows.find((x) => x.day === day);
    return { day, created: r?.created ?? 0, delivered: r?.delivered ?? 0 };
  });
}
