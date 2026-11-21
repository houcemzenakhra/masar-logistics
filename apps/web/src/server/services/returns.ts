/**
 * Fewer wasted trips: orders the recipient confirms before pickup, and what a merchant may see of
 * a recipient's past orders before shipping.
 */
import { and, eq, gte, ne, sql } from "drizzle-orm";
import type { Q } from "../db";
import { merchants, parcelEvents, parcels, recipientRequests, settings } from "../schema";
import { merchantUsers, notify } from "./notify";
import { DomainError, type Actor } from "./parcels";

// ---------- order confirmation ----------

/**
 * The recipient (from the tracking link) or the merchant's or operations' people (after a phone
 * call) answer a confirmation request. A "no" cancels the order before anyone travels: no fees.
 */
export async function answerConfirmation(db: Q, parcelId: string, yes: boolean, by: Actor | "recipient") {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(parcels).where(eq(parcels.id, parcelId)).for("update");
    if (!p) throw new DomainError("Parcel not found");
    if (by !== "recipient") {
      if (by.role === "merchant" && by.merchantId !== p.merchantId) throw new DomainError("Not your parcel");
      if (by.role !== "merchant" && by.role !== "admin") throw new DomainError("Not allowed");
    }
    if (p.confirmation !== "pending" || p.status !== "created") throw new DomainError(p.confirmation === "confirmed" ? "This order is already confirmed" : "This order no longer needs confirming");
    const now = new Date();
    const who = by === "recipient" ? "the recipient" : "phone call";
    await tx
      .update(parcels)
      .set({ confirmation: yes ? "confirmed" : "declined", confirmedAt: now, updatedAt: now, ...(yes ? {} : { status: "cancelled" }) })
      .where(eq(parcels.id, p.id));
    await tx.insert(parcelEvents).values({
      parcelId: p.id,
      status: yes ? "created" : "cancelled",
      note: yes ? `Order confirmed (${who})` : `Order declined (${who})`,
      actorId: by === "recipient" ? null : by.userId,
      createdAt: now,
    });
    if (by === "recipient") await tx.insert(recipientRequests).values({ parcelId: p.id, kind: yes ? "confirm" : "decline", payload: {} });
    const people = await merchantUsers(tx, p.merchantId);
    await notify(tx, people, yes ? "confirmed" : "declined", { tracking: p.tracking, name: p.recipientName }, { parcelId: p.id }, `${p.id}:confirmation`);
    return yes;
  });
}

export async function setConfirmOrders(q: Q, merchantId: string, on: boolean) {
  await q.update(merchants).set({ confirmOrders: on }).where(eq(merchants.id, merchantId));
}

// ---------- recipient history ----------

export type HistorySettings = { enabled: boolean };
const DEFAULTS: HistorySettings = { enabled: true };
/** Only orders from the last year count. */
export const HISTORY_DAYS = 365;

export async function getHistorySettings(q: Q): Promise<HistorySettings> {
  const [r] = await q.select().from(settings).where(eq(settings.key, "recipientHistory"));
  return { ...DEFAULTS, ...((r?.value ?? {}) as Partial<HistorySettings>) };
}

export async function setHistorySettings(q: Q, v: HistorySettings) {
  await q.insert(settings).values({ key: "recipientHistory", value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}

export type RecipientHistory = { orders: number; delivered: number; refused: number; returned: number };

/**
 * How a phone number's past orders went, across all merchants, as counts only: no names, no
 * merchants, no addresses. Asked about one of the merchant's own parcels (they already have the
 * number), and only while operations leave the feature on. Null when off or nothing to show.
 */
export async function recipientHistory(q: Q, parcelId: string, viewer: Actor): Promise<RecipientHistory | null> {
  if (!(await getHistorySettings(q)).enabled) return null;
  const [p] = await q.select({ id: parcels.id, phone: parcels.recipientPhone, merchantId: parcels.merchantId, kind: parcels.kind }).from(parcels).where(eq(parcels.id, parcelId));
  if (!p || p.kind !== "delivery") return null;
  if (viewer.role === "merchant" && viewer.merchantId !== p.merchantId) return null;
  if (viewer.role === "courier") return null;
  const since = new Date(Date.now() - HISTORY_DAYS * 86400_000);
  const [r] = await q
    .select({
      orders: sql<number>`count(*) filter (where ${parcels.status} in ('delivered', 'returned', 'return_initiated'))::int`,
      delivered: sql<number>`count(*) filter (where ${parcels.status} = 'delivered')::int`,
      refused: sql<number>`count(*) filter (where ${parcels.status} in ('returned', 'return_initiated') and ${parcels.failReason} = 'refused')::int`,
      returned: sql<number>`count(*) filter (where ${parcels.status} in ('returned', 'return_initiated'))::int`,
    })
    .from(parcels)
    .where(and(eq(parcels.recipientPhone, p.phone), ne(parcels.id, p.id), eq(parcels.kind, "delivery"), gte(parcels.createdAt, since)));
  return r.orders > 0 ? r : null;
}

/** The return parcel made from a delivery, or the delivery a return parcel comes from. */
export async function linkedParcels(q: Q, p: { id: string; parentId: string | null }) {
  const legs = await q.select({ id: parcels.id, tracking: parcels.tracking, status: parcels.status, description: parcels.description }).from(parcels).where(eq(parcels.parentId, p.id));
  const parent = p.parentId ? (await q.select({ id: parcels.id, tracking: parcels.tracking }).from(parcels).where(eq(parcels.id, p.parentId)))[0] ?? null : null;
  return { legs, parent };
}
