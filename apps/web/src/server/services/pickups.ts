/**
 * When couriers come to a merchant: on the merchant's regular days (every day if none are set),
 * and on days the merchant books. Orders made on other days wait for the next one.
 */
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Q } from "../db";
import { merchants, parcels, pickupRequests } from "../schema";

export class PickupError extends Error {}

/** Today in Algeria, YYYY-MM-DD. */
export const algeriaDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(d);
/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD day. */
export const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
/** Friday: no pickups. */
export const DAY_OFF = 5;
/** Working days in the order Algerians list them, Saturday first. */
export const WORK_DAYS = [6, 0, 1, 2, 3, 4];
export const BOOK_AHEAD_DAYS = 14;

export const parseDays = (s: string) => s.split(",").filter(Boolean).map(Number).filter((n) => WORK_DAYS.includes(n));

export async function setPickupDays(q: Q, merchantId: string, days: number[]) {
  const clean = [...new Set(days)].filter((d) => WORK_DAYS.includes(d)).sort();
  await q.update(merchants).set({ pickupDays: clean.join(",") }).where(eq(merchants.id, merchantId));
  return clean;
}

/** The days a merchant can book: tomorrow to two weeks out, Fridays left out. Today too, before noon. */
export function bookableDays(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", hour12: false }).format(now));
  const out: string[] = [];
  for (let i = hour < 12 ? 0 : 1; i <= BOOK_AHEAD_DAYS; i++) {
    const day = algeriaDay(new Date(now.getTime() + i * 86400_000));
    if (weekday(day) !== DAY_OFF) out.push(day);
  }
  return out;
}

export async function bookPickup(q: Q, a: { merchantId: string; userId: string; day: string; window: "morning" | "afternoon"; note?: string; expected?: number }, now = new Date()) {
  if (!bookableDays(now).includes(a.day)) throw new PickupError("Choose a working day in the next two weeks (today only before noon)");
  const expected = Math.max(0, Math.min(999, Math.round(a.expected ?? 0)));
  const values = { window: a.window, note: (a.note ?? "").trim().slice(0, 200), expected, status: "booked" as const, createdBy: a.userId };
  const [row] = await q
    .insert(pickupRequests)
    .values({ merchantId: a.merchantId, day: a.day, ...values })
    .onConflictDoUpdate({ target: [pickupRequests.merchantId, pickupRequests.day], set: values })
    .returning();
  return row;
}

export async function cancelPickup(q: Q, merchantId: string, id: string) {
  const [row] = await q.update(pickupRequests).set({ status: "cancelled" }).where(and(eq(pickupRequests.id, id), eq(pickupRequests.merchantId, merchantId), eq(pickupRequests.status, "booked"))).returning();
  if (!row) throw new PickupError("Pickup not found, or already cancelled");
  return row;
}

export const upcomingPickups = (q: Q, merchantId: string, from = algeriaDay()) =>
  q.select().from(pickupRequests).where(and(eq(pickupRequests.merchantId, merchantId), gte(pickupRequests.day, from), eq(pickupRequests.status, "booked"))).orderBy(asc(pickupRequests.day));

/**
 * SQL condition, on `parcels`, true when the parcel's merchant is due a pickup on `day`: no
 * regular days set, `day` is one of them, or the merchant booked that day.
 */
export function pickupDueSql(day: string) {
  const wd = weekday(day);
  return sql`(exists (select 1 from merchants m where m.id = ${parcels.merchantId} and (m.pickup_days = '' or (',' || m.pickup_days || ',') like ${`%,${wd},%`}))
    or exists (select 1 from pickup_requests r where r.merchant_id = ${parcels.merchantId} and r.day = ${day} and r.status = 'booked'))`;
}

/** Booked pickups for a day, with how many orders are waiting, for dispatch. */
export async function bookedForDay(q: Q, day: string) {
  const rows = await q
    .select({ id: pickupRequests.id, merchantId: pickupRequests.merchantId, merchant: merchants.name, phone: merchants.phone, address: merchants.address, window: pickupRequests.window, note: pickupRequests.note, expected: pickupRequests.expected })
    .from(pickupRequests)
    .innerJoin(merchants, eq(pickupRequests.merchantId, merchants.id))
    .where(and(eq(pickupRequests.day, day), eq(pickupRequests.status, "booked")))
    .orderBy(asc(pickupRequests.window), asc(merchants.name));
  if (rows.length === 0) return [];
  const counts = await q
    .select({ merchantId: parcels.merchantId, n: sql<number>`count(*)::int` })
    .from(parcels)
    .where(and(inArray(parcels.merchantId, rows.map((r) => r.merchantId)), eq(parcels.status, "created")))
    .groupBy(parcels.merchantId);
  return rows.map((r) => ({ ...r, waiting: counts.find((c) => c.merchantId === r.merchantId)?.n ?? 0 }));
}
