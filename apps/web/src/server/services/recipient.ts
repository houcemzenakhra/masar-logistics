/**
 * What a recipient can do from the tracking link, without an account: choose another day, leave
 * directions for the courier, and rate the delivery. They prove who they are with the last four
 * digits of their phone number; wrong guesses are limited per parcel.
 */
import { eq } from "drizzle-orm";
import type { Q } from "../db";
import { isTerminal, type Status } from "../domain/state";
import { parcels, recipientRequests } from "../schema";
import { algeriaToday } from "./dispatch";
import { notify } from "./notify";
import { DomainError } from "./parcels";
import { LIMITS, checkLimit, clearLimit, rateLimit } from "./security";

const digits = (s: string) => s.replace(/\D/g, "");

/** Checks the last four digits of the recipient's phone. */
export async function verifyRecipient(q: Q, tracking: string, last4: string) {
  const limit = LIMITS.trackVerify(tracking);
  const l = await checkLimit(q, [limit]);
  if (!l.ok) throw new DomainError("Too many wrong tries. Try again in an hour.");
  const [p] = await q.select({ id: parcels.id, phone: parcels.recipientPhone }).from(parcels).where(eq(parcels.tracking, tracking.trim().toUpperCase()));
  const ok = !!p && digits(last4).length === 4 && digits(p.phone).endsWith(digits(last4));
  if (!ok) {
    await rateLimit(q, [limit]);
    throw new DomainError("Those digits do not match the phone number on this parcel");
  }
  await clearLimit(q, limit.key);
  return p.id;
}

/** Days a recipient may choose: tomorrow to a week ahead. */
export function rescheduleDays(now = new Date()) {
  return Array.from({ length: 7 }, (_, i) => algeriaToday(new Date(now.getTime() + (i + 1) * 86400_000)));
}

/** Tells the courier carrying the parcel today, if any. */
async function tellCourier(q: Q, p: typeof parcels.$inferSelect, what: Record<"en" | "fr" | "ar", string>) {
  if (p.status === "out_for_delivery" && p.courierId) await notify(q, [p.courierId], "recipient", { tracking: p.tracking, what }, { parcelId: p.id });
}

async function load(q: Q, parcelId: string) {
  const [p] = await q.select().from(parcels).where(eq(parcels.id, parcelId));
  if (!p) throw new DomainError("Parcel not found");
  return p;
}

export async function reschedule(db: Q, parcelId: string, day: string) {
  return db.transaction(async (tx) => {
    const p = await load(tx, parcelId);
    if (isTerminal(p.status as Status) || p.status === "return_initiated") throw new DomainError("This parcel can no longer be rescheduled");
    if (!rescheduleDays().includes(day)) throw new DomainError("Choose a day between tomorrow and a week from now");
    await tx.update(parcels).set({ preferredDate: day, updatedAt: new Date() }).where(eq(parcels.id, p.id));
    await tx.insert(recipientRequests).values({ parcelId: p.id, kind: "reschedule", payload: { day } });
    await tellCourier(tx, p, { en: `asks to be delivered on ${day}`, fr: `demande une livraison le ${day}`, ar: `يطلب التسليم يوم ${day}` });
  });
}

export async function setInstructions(db: Q, parcelId: string, text: string) {
  const v = text.trim().slice(0, 200);
  return db.transaction(async (tx) => {
    const p = await load(tx, parcelId);
    if (isTerminal(p.status as Status)) throw new DomainError("This parcel is already closed");
    await tx.update(parcels).set({ instructions: v, updatedAt: new Date() }).where(eq(parcels.id, p.id));
    await tx.insert(recipientRequests).values({ parcelId: p.id, kind: "instructions", payload: { text: v } });
    if (v) await tellCourier(tx, p, { en: v, fr: v, ar: v });
  });
}

export async function rate(db: Q, parcelId: string, stars: number, comment = "") {
  return db.transaction(async (tx) => {
    const p = await load(tx, parcelId);
    if (p.status !== "delivered") throw new DomainError("You can rate the delivery once you have the parcel");
    if (p.rating != null) throw new DomainError("This delivery has already been rated. Thank you!");
    const n = Math.round(stars);
    if (n < 1 || n > 5) throw new DomainError("Choose from 1 to 5 stars");
    await tx.update(parcels).set({ rating: n, ratingComment: comment.trim().slice(0, 300) }).where(eq(parcels.id, p.id));
    await tx.insert(recipientRequests).values({ parcelId: p.id, kind: "rating", payload: { stars: n, comment: comment.trim().slice(0, 300) } });
  });
}

export const listRequests = (q: Q, parcelId: string) =>
  q.select().from(recipientRequests).where(eq(recipientRequests.parcelId, parcelId)).orderBy(recipientRequests.createdAt);
