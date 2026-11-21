import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Session } from "../auth";
import type { Q } from "../db";
import { DEFAULT_VOLUME_DIVISOR, chargeableKg, quote, tierFor, type Size, type Tier } from "../domain/pricing";
import { normalizeMobile } from "../phone";
import { MAX_ATTEMPTS, canTransition, type Status } from "../domain/state";
import { bags, communes, hubs, merchants, parcelEvents, parcels, rateTiers, settings, stopDesks, users, wilayas } from "../schema";
import { deskFee, getDeskSettings } from "./desks";
import { parcelEventData, queueWebhook } from "./integrations";
import { acct, post } from "./ledger";
import { FAIL_REASONS, REASON_TEXT, merchantUsers, notify, type FailReason } from "./notify";
import { queueParcelSms } from "./sms";

export class DomainError extends Error {}

/** The merchant's order number is already on a parcel. Carries the existing tracking number. */
export class DuplicateOrderError extends DomainError {
  constructor(public externalRef: string, public tracking: string) {
    super(`Order ${externalRef} was already sent as ${tracking}`);
  }
}

export type Actor = Pick<Session, "userId" | "role" | "merchantId" | "hubId">;

const destWilaya = alias(wilayas, "dest_wilaya");
const destCommune = alias(communes, "dest_commune");
const destHub = alias(hubs, "dest_hub");
const currentHub = alias(hubs, "current_hub");

const view = {
  id: parcels.id,
  tracking: parcels.tracking,
  status: parcels.status,
  merchantId: parcels.merchantId,
  merchantName: merchants.name,
  recipientName: parcels.recipientName,
  recipientPhone: parcels.recipientPhone,
  destWilayaId: parcels.destWilayaId,
  destWilaya: destWilaya.name,
  destWilayaAr: destWilaya.nameAr,
  commune: parcels.commune,
  communeAr: destCommune.nameAr,
  communeId: parcels.communeId,
  /** Centre of the destination commune: where the stop goes on a map. */
  lat: destCommune.lat,
  lng: destCommune.lng,
  address: parcels.address,
  recipientLang: parcels.recipientLang,
  description: parcels.description,
  weightKg: parcels.weightKg,
  codAmount: parcels.codAmount,
  deliveryFee: parcels.deliveryFee,
  returnFee: parcels.returnFee,
  originHubId: parcels.originHubId,
  destHubId: parcels.destHubId,
  destHub: destHub.name,
  currentHubId: parcels.currentHubId,
  currentHub: currentHub.name,
  courierId: parcels.courierId,
  courierName: users.name,
  bagId: parcels.bagId,
  routeSeq: parcels.routeSeq,
  attempts: parcels.attempts,
  failReason: parcels.failReason,
  preferredDate: parcels.preferredDate,
  instructions: parcels.instructions,
  rating: parcels.rating,
  ratingComment: parcels.ratingComment,
  confirmation: parcels.confirmation,
  confirmedAt: parcels.confirmedAt,
  deliveryType: parcels.deliveryType,
  stopDeskId: parcels.stopDeskId,
  desk: stopDesks.name,
  deskAddress: stopDesks.address,
  deskHours: stopDesks.hours,
  allowPartial: parcels.allowPartial,
  exchange: parcels.exchange,
  exchangeNote: parcels.exchangeNote,
  collectedAmount: parcels.collectedAmount,
  kind: parcels.kind,
  parentId: parcels.parentId,
  externalRef: parcels.externalRef,
  lengthCm: parcels.lengthCm,
  widthCm: parcels.widthCm,
  heightCm: parcels.heightCm,
  eta: parcels.eta,
  createdAt: parcels.createdAt,
  updatedAt: parcels.updatedAt,
  deliveredAt: parcels.deliveredAt,
};

function baseQuery(q: Q) {
  return q
    .select(view)
    .from(parcels)
    .innerJoin(merchants, eq(parcels.merchantId, merchants.id))
    .innerJoin(destWilaya, eq(parcels.destWilayaId, destWilaya.id))
    .innerJoin(destHub, eq(parcels.destHubId, destHub.id))
    .leftJoin(destCommune, eq(parcels.communeId, destCommune.id))
    .leftJoin(currentHub, eq(parcels.currentHubId, currentHub.id))
    .leftJoin(users, eq(parcels.courierId, users.id))
    .leftJoin(stopDesks, eq(parcels.stopDeskId, stopDesks.id));
}

export type ParcelView = Awaited<ReturnType<typeof listParcels>>[number];
export type ParcelStatus = Status;

export async function listParcels(
  q: Q,
  f: {
    merchantId?: string | null;
    courierId?: string;
    bagId?: string;
    importId?: string;
    /** Parcels on a hub's floor that could go into a bag for this route. */
    baggable?: { originHubId: string; destHubId: string };
    status?: Status | Status[];
    /** Stop desk parcels of one hub, for its desk counter. */
    deskHubId?: string;
    /** The merchant's own order number. */
    externalRef?: string;
    search?: string;
    limit?: number;
  } = {},
) {
  const where = [];
  if (f.merchantId) where.push(eq(parcels.merchantId, f.merchantId));
  if (f.courierId) where.push(eq(parcels.courierId, f.courierId));
  if (f.bagId) where.push(eq(parcels.bagId, f.bagId));
  if (f.importId) where.push(eq(parcels.importId, f.importId));
  if (f.baggable) {
    where.push(eq(parcels.status, "at_origin_hub"), eq(parcels.currentHubId, f.baggable.originHubId), eq(parcels.destHubId, f.baggable.destHubId), sql`${parcels.bagId} is null`);
  }
  if (f.externalRef) where.push(eq(parcels.externalRef, f.externalRef));
  if (f.deskHubId) where.push(eq(parcels.deliveryType, "desk"), eq(parcels.destHubId, f.deskHubId));
  if (f.status) where.push(Array.isArray(f.status) ? inArray(parcels.status, f.status) : eq(parcels.status, f.status));
  if (f.search?.trim()) {
    const s = `%${f.search.trim()}%`;
    where.push(or(ilike(parcels.tracking, s), ilike(parcels.recipientName, s), ilike(parcels.recipientPhone, s)));
  }
  return baseQuery(q)
    .where(where.length ? and(...where) : undefined)
    // A courier's list follows the optimised route; everything else is newest first.
    .orderBy(...(f.courierId ? [sql`${parcels.routeSeq} asc nulls last`] : []), desc(parcels.updatedAt))
    .limit(f.limit ?? 200);
}

export async function getParcel(q: Q, key: { id: string } | { tracking: string }) {
  const cond = "id" in key ? eq(parcels.id, key.id) : eq(parcels.tracking, key.tracking.trim().toUpperCase());
  const [p] = await baseQuery(q).where(cond).limit(1);
  if (!p) return null;
  const events = await q
    .select({
      id: parcelEvents.id,
      status: parcelEvents.status,
      note: parcelEvents.note,
      createdAt: parcelEvents.createdAt,
      hub: hubs.name,
      actor: users.name,
    })
    .from(parcelEvents)
    .leftJoin(hubs, eq(parcelEvents.hubId, hubs.id))
    .leftJoin(users, eq(parcelEvents.actorId, users.id))
    .where(eq(parcelEvents.parcelId, p.id))
    .orderBy(desc(parcelEvents.createdAt));
  return { ...p, events };
}

export type PricingSettings = { /** 0: volume pricing off. */ divisor: number };

export async function getPricingSettings(q: Q): Promise<PricingSettings> {
  const [r] = await q.select().from(settings).where(eq(settings.key, "pricing"));
  const v = (r?.value ?? {}) as Partial<PricingSettings>;
  return { divisor: typeof v.divisor === "number" ? v.divisor : DEFAULT_VOLUME_DIVISOR };
}

export async function setPricingSettings(q: Q, v: PricingSettings) {
  if (!Number.isInteger(v.divisor) || v.divisor < 0 || v.divisor > 10000) throw new DomainError("The volume divisor must be between 0 (off) and 10,000");
  await q.insert(settings).values({ key: "pricing", value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}

/** Sizes must be whole centimetres, 1 to 300, and given all three or not at all. */
function checkSize(s: Size): Size {
  const vals = [s.lengthCm, s.widthCm, s.heightCm];
  if (vals.every((v) => v == null)) return { lengthCm: null, widthCm: null, heightCm: null };
  if (vals.some((v) => v == null || !Number.isFinite(v) || v < 1 || v > 300)) throw new DomainError("Give length, width and height in cm, each from 1 to 300");
  const [lengthCm, widthCm, heightCm] = vals.map((v) => Math.ceil(v!));
  return { lengthCm, widthCm, heightCm };
}

/** Fees for a parcel between two wilayas, by its chargeable weight, with the stop desk discount. */
async function priceFor(tx: Q, a: { origin: { id: number; zone: number }; dest: { id: number; zone: number }; weightKg: number; size: Size; desk: boolean }) {
  const [tier] = await tx.select().from(rateTiers).where(eq(rateTiers.key, tierFor(a.origin, a.dest)));
  const kg = chargeableKg(a.weightKg, a.size, (await getPricingSettings(tx)).divisor);
  const price = quote(tier, kg);
  return { deliveryFee: a.desk ? deskFee(price.deliveryFee, await getDeskSettings(tx)) : price.deliveryFee, returnFee: price.returnFee, chargeableKg: kg };
}

export async function getTiers(q: Q): Promise<Tier[]> {
  const order = ["local", "north", "highlands", "south"];
  const rows = await q.select().from(rateTiers);
  return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

function newTracking() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000;
  return `MSR${String(n).padStart(9, "0")}`;
}

export type NewParcel = {
  merchantId: string;
  recipientName: string;
  recipientPhone: string;
  destWilayaId: number;
  /** Language of the text messages to the recipient. Default French. */
  recipientLang?: "fr" | "ar";
  /** The spreadsheet import this order comes from. */
  importId?: string;
  /** From the commune directory. Give this, or a free-text `commune` for imports. */
  communeId?: number;
  commune?: string;
  address: string;
  description?: string;
  weightKg: number;
  codAmount: number;
  /** `desk`: the recipient collects it at `stopDeskId`. Default: delivered to the door. */
  deliveryType?: "home" | "desk";
  stopDeskId?: string;
  /** The recipient may keep part of the order and pay less. */
  allowPartial?: boolean;
  /** The courier collects an item on delivery; `exchangeNote` says which. */
  exchange?: boolean;
  exchangeNote?: string;
  /** The merchant's own order number. An order with a number already used is refused. */
  externalRef?: string;
  /** Outer size in cm; large light parcels are charged by volume. */
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
};

export async function createParcel(db: Q, input: NewParcel, actor: Actor, at = new Date()) {
  if (actor.role === "merchant" && actor.merchantId !== input.merchantId) throw new DomainError("Not your merchant account");
  if (actor.role !== "merchant" && actor.role !== "admin") throw new DomainError("Not allowed to create parcels");
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(merchants).where(eq(merchants.id, input.merchantId));
    if (!m) throw new DomainError("Unknown merchant");
    if (m.status === "pending") throw new DomainError("Your account is waiting for approval. You can create orders once it is approved.");
    if (m.status === "suspended") throw new DomainError("This merchant account is suspended");
    let commune = input.commune?.trim() ?? "";
    let address = input.address;
    let desk: typeof stopDesks.$inferSelect | undefined;
    if (input.deliveryType === "desk") {
      if (!input.stopDeskId) throw new DomainError("Choose the stop desk");
      [desk] = await tx.select().from(stopDesks).where(eq(stopDesks.id, input.stopDeskId));
      if (!desk || !desk.active) throw new DomainError("That stop desk is not open");
      if (desk.wilayaId !== input.destWilayaId) throw new DomainError("That stop desk is not in the chosen wilaya");
      address = `${desk.name}, ${desk.address}`;
      if (desk.communeId) input = { ...input, communeId: desk.communeId };
      else commune = commune || desk.address;
    }
    if (input.exchange && !input.exchangeNote?.trim()) throw new DomainError("Say which item the courier collects in exchange");
    const externalRef = input.externalRef?.trim().slice(0, 80) || null;
    if (externalRef) {
      const [dup] = await tx.select({ tracking: parcels.tracking }).from(parcels).where(and(eq(parcels.merchantId, m.id), eq(parcels.externalRef, externalRef)));
      if (dup) throw new DuplicateOrderError(externalRef, dup.tracking);
    }
    if (input.communeId) {
      const [c] = await tx.select().from(communes).where(eq(communes.id, input.communeId));
      if (!c || c.wilayaId !== input.destWilayaId) throw new DomainError("That commune is not in the chosen wilaya");
      commune = c.name;
    }
    if (!commune) throw new DomainError("Choose a commune");
    const ws = await tx.select().from(wilayas).where(inArray(wilayas.id, [m.wilayaId, input.destWilayaId]));
    const origin = ws.find((w) => w.id === m.wilayaId);
    const dest = ws.find((w) => w.id === input.destWilayaId);
    if (!origin || !dest) throw new DomainError("Unknown wilaya");
    const size = checkSize(input);
    const price = await priceFor(tx, { origin, dest, weightKg: input.weightKg, size, desk: !!desk });
    const fee = price.deliveryFee;
    const [p] = await tx
      .insert(parcels)
      .values({
        ...input,
        recipientPhone: normalizeMobile(input.recipientPhone) ?? input.recipientPhone.trim(),
        address,
        commune,
        deliveryType: desk ? "desk" : "home",
        stopDeskId: desk?.id ?? null,
        allowPartial: input.allowPartial ?? false,
        exchange: input.exchange ?? false,
        exchangeNote: input.exchange ? input.exchangeNote!.trim().slice(0, 200) : "",
        confirmation: m.confirmOrders ? "pending" : "none",
        externalRef,
        ...size,
        description: input.description ?? "",
        tracking: newTracking(),
        originWilayaId: origin.id,
        deliveryFee: fee,
        returnFee: price.returnFee,
        originHubId: origin.hubId,
        destHubId: desk?.hubId ?? dest.hubId,
        createdAt: at,
        updatedAt: at,
      })
      .returning();
    await tx.insert(parcelEvents).values({ parcelId: p.id, status: "created", actorId: actor.userId, note: "Order created", createdAt: at });
    if (p.confirmation === "pending") await queueParcelSms(tx, p.id, "confirm_order");
    await queueWebhook(tx, p.merchantId, "parcel.created", parcelEventData(p), p.id);
    return p;
  });
}

export type TransitionInput = {
  parcelId: string;
  to: Status;
  actor: Actor;
  note?: string;
  /** Required when assigning a pickup or sending a parcel out for delivery. */
  courierId?: string;
  /** Makes retried requests from offline devices safe. */
  idempotencyKey?: string;
  /** When it happened, for late-syncing devices and imports. Defaults to now. */
  at?: Date;
  /** Set by the linehaul service when it moves a whole bag. */
  viaBag?: boolean;
  /** Why a delivery failed. A refusal sends the parcel back at once. */
  reason?: FailReason;
  /** With reason `reschedule`: the day the recipient asked for, YYYY-MM-DD. */
  preferredDate?: string;
  /** On delivery: cash actually taken, when the recipient kept only part of the order. */
  collected?: number;
  /** On a partial delivery: what comes back, for the merchant. */
  returnedItems?: string;
};

export { FAIL_REASONS, type FailReason };

/**
 * The only way a parcel changes status. Checks the state machine and the actor's role, writes the
 * event, and posts ledger entries for delivery and returns, all in one database transaction.
 */
export async function transition(db: Q, input: TransitionInput) {
  const { actor, to } = input;
  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const [seen] = await tx.select().from(parcelEvents).where(eq(parcelEvents.idempotencyKey, input.idempotencyKey));
      if (seen) {
        const [p] = await tx.select().from(parcels).where(eq(parcels.id, seen.parcelId));
        return p;
      }
    }
    const [p] = await tx.select().from(parcels).where(eq(parcels.id, input.parcelId)).for("update");
    if (!p) throw new DomainError("Parcel not found");
    const from = p.status as Status;

    if (!canTransition(from, to, actor.role)) {
      throw new DomainError(`A ${actor.role} cannot move a parcel from "${from}" to "${to}"`);
    }
    if (actor.role === "merchant" && actor.merchantId !== p.merchantId) throw new DomainError("Not your parcel");
    if (actor.role === "courier" && p.courierId !== actor.userId) throw new DomainError("This parcel is not assigned to you");

    if (p.bagId && !input.viaBag) {
      const [bag] = await tx.select().from(bags).where(eq(bags.id, p.bagId));
      if (bag && bag.status !== "received") {
        throw new DomainError(`${p.tracking} is in bag ${bag.code}. Move the bag, or take the parcel out of it first.`);
      }
    }

    const at = input.at ?? new Date();
    const patch: Partial<typeof parcels.$inferInsert> = { status: to, updatedAt: at };
    let hubId: string | null = null;

    if (to === "pickup_assigned" || to === "out_for_delivery") {
      if (!input.courierId) throw new DomainError("Choose a courier");
      const [c] = await tx.select().from(users).where(and(eq(users.id, input.courierId), eq(users.role, "courier")));
      if (!c || !c.active) throw new DomainError("Unknown courier");
      patch.courierId = c.id;
    }
    if (to === "pickup_assigned" && p.confirmation === "pending") {
      throw new DomainError(`${p.tracking} is waiting for the recipient to confirm the order`);
    }
    if (to === "out_for_delivery" && p.deliveryType === "desk") {
      throw new DomainError(`${p.tracking} is collected at a stop desk: put it on the desk shelf instead`);
    }
    if (to === "ready_for_pickup") {
      if (p.deliveryType !== "desk") throw new DomainError(`${p.tracking} is a home delivery, not a stop desk parcel`);
      if (from === "at_origin_hub" && p.originHubId !== p.destHubId) throw new DomainError("This parcel must travel to its destination hub first");
      if (actor.role === "hub" && actor.hubId !== p.destHubId) throw new DomainError("This parcel's stop desk belongs to another hub");
      hubId = p.destHubId;
      patch.currentHubId = p.destHubId;
      patch.courierId = null;
    }
    if (from === "ready_for_pickup" && actor.role === "hub" && actor.hubId !== p.destHubId) {
      throw new DomainError("This parcel is at another hub's stop desk");
    }
    if (to === "out_for_delivery" && from === "at_origin_hub" && p.originHubId !== p.destHubId) {
      throw new DomainError("This parcel must travel to its destination hub first");
    }
    if (to === "in_transit" && p.originHubId === p.destHubId) {
      throw new DomainError("Origin and destination hub are the same: send it out for delivery instead");
    }
    if (to === "created") patch.courierId = null;
    if (to !== "out_for_delivery") patch.routeSeq = null;
    if (to === "at_origin_hub") {
      hubId = p.originHubId;
      patch.currentHubId = hubId;
      patch.courierId = null;
    }
    if (to === "in_transit") {
      hubId = p.originHubId;
      patch.currentHubId = null;
    }
    if (to === "at_destination_hub") {
      hubId = p.destHubId;
      patch.currentHubId = hubId;
    }
    if (to === "out_for_delivery") {
      hubId = p.destHubId;
      patch.currentHubId = null;
    }
    if (to === "attempt_failed") {
      patch.attempts = p.attempts + 1;
      patch.currentHubId = p.destHubId;
      patch.failReason = input.reason ?? "other";
      if (input.reason === "reschedule" && input.preferredDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.preferredDate)) throw new DomainError("The new day must be a date like 2026-11-24");
        patch.preferredDate = input.preferredDate;
      }
    }
    if (to === "returned") patch.courierId = null;
    let partial = false;
    if (to === "delivered") {
      patch.deliveredAt = at;
      patch.attempts = p.attempts + 1;
      const collected = input.collected ?? p.codAmount;
      if (collected !== p.codAmount) {
        if (!p.allowPartial) throw new DomainError("The merchant did not allow partial delivery for this order: collect the full amount, or record a failed attempt");
        if (!Number.isInteger(collected) || collected < 0 || collected >= p.codAmount) throw new DomainError("The amount collected must be less than the amount due, and not negative");
        if (!input.returnedItems?.trim()) throw new DomainError("Say what the recipient did not keep");
        partial = true;
        patch.collectedAmount = collected;
      }
      // Whoever handed the parcel over now holds the cash: the courier, or the hub's stop desk
      // (company cash). The merchant is owed it minus the delivery fee.
      await post(tx, {
        kind: "delivery",
        parcelId: p.id,
        memo: partial ? `Delivered in part ${p.tracking}` : `Delivered ${p.tracking}`,
        createdBy: actor.userId,
        lines: [
          { account: from === "ready_for_pickup" ? acct.companyCash : acct.courier(p.courierId ?? actor.userId), amount: collected },
          { account: acct.merchant(p.merchantId), amount: -(collected - p.deliveryFee) },
          { account: acct.revenueDelivery, amount: -p.deliveryFee },
        ],
      });
    }
    if (to === "returned") {
      await post(tx, {
        kind: "return_fee",
        parcelId: p.id,
        memo: `Return fee ${p.tracking}`,
        createdBy: actor.userId,
        lines: [
          { account: acct.merchant(p.merchantId), amount: p.returnFee },
          { account: acct.revenueReturns, amount: -p.returnFee },
        ],
      });
    }

    const reasonText = to === "attempt_failed" ? REASON_TEXT[input.reason ?? "other"].en : partial ? `Kept part, paid ${patch.collectedAmount} DZD. Not kept: ${input.returnedItems!.trim()}` : "";
    await tx.insert(parcelEvents).values({
      parcelId: p.id,
      status: to,
      note: [reasonText, input.note].filter(Boolean).join(": "),
      actorId: actor.userId,
      hubId,
      idempotencyKey: input.idempotencyKey,
      createdAt: at,
    });

    // Refused, or too many failed attempts: the parcel goes back to the merchant.
    const refused = to === "attempt_failed" && input.reason === "refused";
    if (to === "attempt_failed" && (refused || (patch.attempts ?? 0) >= MAX_ATTEMPTS)) {
      patch.status = "return_initiated";
      await tx.insert(parcelEvents).values({
        parcelId: p.id,
        status: "return_initiated",
        note: refused ? "Returned: the recipient refused the parcel" : `Returned automatically after ${MAX_ATTEMPTS} failed attempts`,
        hubId: p.destHubId,
        createdAt: new Date(at.getTime() + 1),
      });
    }

    const [updated] = await tx.update(parcels).set(patch).where(eq(parcels.id, p.id)).returning();

    // What the recipient did not keep, or the item taken in exchange, goes back to the merchant.
    let leg: typeof parcels.$inferSelect | null = null;
    if (to === "delivered" && (partial || p.exchange) && p.kind === "delivery") {
      leg = await createReturnLeg(tx, p, partial ? `Not kept from ${p.tracking}: ${input.returnedItems!.trim()}` : `Exchange from ${p.tracking}: ${p.exchangeNote}`, from === "ready_for_pickup" ? null : p.courierId, actor, at);
    }

    // Tell the merchant's shop, if it listens.
    await queueWebhook(tx, p.merchantId, "parcel.status_changed", parcelEventData(updated, from), p.id);
    if (leg) await queueWebhook(tx, p.merchantId, "parcel.created", parcelEventData(leg), leg.id);

    // Text the recipient. Queued in this transaction, sent after the response.
    if (to === "out_for_delivery") await queueParcelSms(tx, p.id, "out_for_delivery");
    if (to === "delivered") await queueParcelSms(tx, p.id, "delivered");
    if (to === "ready_for_pickup") await queueParcelSms(tx, p.id, "ready_at_desk");
    // When the parcel is going back to the merchant, the recipient is not told "we will come back".
    if (to === "attempt_failed" && updated.status === "attempt_failed") await queueParcelSms(tx, p.id, "attempt_failed");

    // Tell the merchant's people. Each event notifies once, however often it is replayed.
    const vars = { tracking: p.tracking, name: p.recipientName };
    const data = { parcelId: p.id };
    if (to === "delivered" || to === "attempt_failed" || to === "returned" || updated.status === "return_initiated") {
      const people = await merchantUsers(tx, p.merchantId);
      if (to === "delivered" && partial) await notify(tx, people, "partial", { ...vars, amount: patch.collectedAmount!, leg: leg!.tracking }, data, `${p.id}:delivered`);
      else if (to === "delivered") await notify(tx, people, "delivered", { ...vars, amount: p.codAmount - p.deliveryFee }, data, `${p.id}:delivered`);
      if (to === "delivered" && leg && !partial) await notify(tx, people, "exchange_back", { ...vars, leg: leg.tracking }, { parcelId: leg.id }, `${p.id}:exchange`);
      else if (to === "returned") await notify(tx, people, "returned", { ...vars, fee: p.returnFee }, data, `${p.id}:returned`);
      else if (updated.status === "return_initiated") {
        const why = refused ? REASON_TEXT.refused : { en: `${MAX_ATTEMPTS} failed attempts`, fr: `${MAX_ATTEMPTS} tentatives échouées`, ar: `${MAX_ATTEMPTS} محاولات فاشلة` };
        await notify(tx, people, "returning", { ...vars, reason: to === "return_initiated" ? { en: "returned by operations", fr: "retour décidé par l'exploitation", ar: "إرجاع بقرار من الإدارة" } : why }, data, `${p.id}:returning`);
      } else await notify(tx, people, "failed", { ...vars, reason: REASON_TEXT[input.reason ?? "other"], n: updated.attempts, max: MAX_ATTEMPTS }, data, `${p.id}:failed:${updated.attempts}`);
    }
    return updated;
  });
}

/**
 * Goods coming back to the merchant after a partial delivery or an exchange: a parcel of its own,
 * already on its way back, so it is scanned, tracked and charged (the return fee) like any return.
 */
async function createReturnLeg(tx: Q, p: typeof parcels.$inferSelect, what: string, courierId: string | null, actor: Actor, at: Date) {
  const [m] = await tx.select().from(merchants).where(eq(merchants.id, p.merchantId));
  const [w] = await tx.select().from(wilayas).where(eq(wilayas.id, m.wilayaId));
  const [leg] = await tx
    .insert(parcels)
    .values({
      tracking: newTracking(),
      merchantId: p.merchantId,
      kind: "return_leg",
      parentId: p.id,
      recipientName: m.name,
      recipientPhone: m.phone,
      originWilayaId: p.destWilayaId,
      destWilayaId: m.wilayaId,
      commune: w.name,
      address: m.address || w.name,
      description: what.slice(0, 300),
      weightKg: 1,
      codAmount: 0,
      deliveryFee: 0,
      returnFee: p.returnFee,
      status: "return_initiated",
      originHubId: p.destHubId,
      destHubId: p.originHubId,
      currentHubId: courierId ? null : p.destHubId,
      courierId,
      createdAt: at,
      updatedAt: at,
    })
    .returning();
  await tx.insert(parcelEvents).values({ parcelId: leg.id, status: "return_initiated", note: what.slice(0, 300), actorId: actor.userId, hubId: courierId ? null : p.destHubId, createdAt: at });
  return leg;
}

/**
 * The hub weighs or measures a parcel and the fees follow, until it is delivered or returned.
 * The merchant sees the change in the parcel's history.
 */
export async function measureParcel(db: Q, a: { parcelId: string; weightKg: number; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null }, actor: Actor) {
  if (actor.role !== "hub" && actor.role !== "admin") throw new DomainError("Only hub teams and operations measure parcels");
  if (!(a.weightKg > 0 && a.weightKg <= 70)) throw new DomainError("Weight must be between 0.1 and 70 kg");
  const size = checkSize(a);
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(parcels).where(eq(parcels.id, a.parcelId)).for("update");
    if (!p) throw new DomainError("Parcel not found");
    if (["delivered", "returned", "cancelled", "lost"].includes(p.status) || p.kind !== "delivery") throw new DomainError("This parcel's fees are settled");
    if (actor.role === "hub" && p.currentHubId !== actor.hubId) throw new DomainError("Measure parcels on your hub's floor");
    const ws = await tx.select().from(wilayas).where(inArray(wilayas.id, [p.originWilayaId, p.destWilayaId]));
    const price = await priceFor(tx, { origin: ws.find((w) => w.id === p.originWilayaId)!, dest: ws.find((w) => w.id === p.destWilayaId)!, weightKg: a.weightKg, size, desk: p.deliveryType === "desk" });
    const weightKg = Math.ceil(a.weightKg);
    const [updated] = await tx.update(parcels).set({ weightKg, ...size, deliveryFee: price.deliveryFee, returnFee: price.returnFee, updatedAt: new Date() }).where(eq(parcels.id, p.id)).returning();
    const dims = size.lengthCm ? `, ${size.lengthCm}×${size.widthCm}×${size.heightCm} cm` : "";
    await tx.insert(parcelEvents).values({
      parcelId: p.id,
      status: p.status,
      note: `Measured at the hub: ${weightKg} kg${dims}, charged as ${price.chargeableKg} kg. Fee ${p.deliveryFee} → ${price.deliveryFee} DZD`,
      actorId: actor.userId,
      hubId: p.currentHubId,
    });
    return { before: p.deliveryFee, after: price.deliveryFee, chargeableKg: price.chargeableKg, parcel: updated };
  });
}

/** What a hub scan means depends on where the parcel is. */
export function hubScanTarget(status: Status, direction: "in" | "out"): Status | null {
  if (direction === "in") {
    if (status === "picked_up") return "at_origin_hub";
    if (status === "in_transit") return "at_destination_hub";
    if (status === "return_initiated") return "returned";
  } else if (status === "at_origin_hub") return "in_transit";
  return null;
}

export async function statusCounts(q: Q, merchantId?: string | null) {
  const rows = await q
    .select({ status: parcels.status, n: sql<number>`count(*)::int` })
    .from(parcels)
    .where(merchantId ? eq(parcels.merchantId, merchantId) : undefined)
    .groupBy(parcels.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<Status, number>>;
}

export async function dailyVolume(q: Q, days = 14, merchantId?: string | null) {
  const rows = await q
    .select({
      day: sql<string>`to_char(date_trunc('day', ${parcels.createdAt}), 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(parcels)
    .where(
      and(
        sql`${parcels.createdAt} > now() - make_interval(days => ${days})`,
        merchantId ? eq(parcels.merchantId, merchantId) : undefined,
      ),
    )
    .groupBy(sql`1`);
  const by = Object.fromEntries(rows.map((r) => [r.day, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { day: d, n: by[d] ?? 0 };
  });
}
