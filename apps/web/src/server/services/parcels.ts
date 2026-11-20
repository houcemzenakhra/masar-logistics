import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Session } from "../auth";
import type { Q } from "../db";
import { quote, tierFor, type Tier } from "../domain/pricing";
import { MAX_ATTEMPTS, canTransition, type Status } from "../domain/state";
import { bags, communes, hubs, merchants, parcelEvents, parcels, rateTiers, users, wilayas } from "../schema";
import { acct, post } from "./ledger";
import { queueParcelSms } from "./sms";

export class DomainError extends Error {}

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
    .leftJoin(users, eq(parcels.courierId, users.id));
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
    const [tier] = await tx.select().from(rateTiers).where(eq(rateTiers.key, tierFor(origin, dest)));
    const price = quote(tier, input.weightKg);
    const [p] = await tx
      .insert(parcels)
      .values({
        ...input,
        commune,
        description: input.description ?? "",
        tracking: newTracking(),
        originWilayaId: origin.id,
        deliveryFee: price.deliveryFee,
        returnFee: price.returnFee,
        originHubId: origin.hubId,
        destHubId: dest.hubId,
        createdAt: at,
        updatedAt: at,
      })
      .returning();
    await tx.insert(parcelEvents).values({ parcelId: p.id, status: "created", actorId: actor.userId, note: "Order created", createdAt: at });
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
};

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
    }
    if (to === "returned") patch.courierId = null;
    if (to === "delivered") {
      patch.deliveredAt = at;
      patch.attempts = p.attempts + 1;
      // Courier now holds the cash; the merchant is owed it minus the delivery fee.
      await post(tx, {
        kind: "delivery",
        parcelId: p.id,
        memo: `Delivered ${p.tracking}`,
        createdBy: actor.userId,
        lines: [
          { account: acct.courier(p.courierId ?? actor.userId), amount: p.codAmount },
          { account: acct.merchant(p.merchantId), amount: -(p.codAmount - p.deliveryFee) },
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

    await tx.insert(parcelEvents).values({
      parcelId: p.id,
      status: to,
      note: input.note ?? "",
      actorId: actor.userId,
      hubId,
      idempotencyKey: input.idempotencyKey,
      createdAt: at,
    });

    // Too many failed attempts: the parcel goes back to the merchant.
    if (to === "attempt_failed" && (patch.attempts ?? 0) >= MAX_ATTEMPTS) {
      patch.status = "return_initiated";
      await tx.insert(parcelEvents).values({
        parcelId: p.id,
        status: "return_initiated",
        note: `Returned automatically after ${MAX_ATTEMPTS} failed attempts`,
        hubId: p.destHubId,
        createdAt: new Date(at.getTime() + 1),
      });
    }

    const [updated] = await tx.update(parcels).set(patch).where(eq(parcels.id, p.id)).returning();

    // Text the recipient. Queued in this transaction, sent after the response.
    if (to === "out_for_delivery") await queueParcelSms(tx, p.id, "out_for_delivery");
    if (to === "delivered") await queueParcelSms(tx, p.id, "delivered");
    // When the parcel is going back to the merchant, the recipient is not told "we will come back".
    if (to === "attempt_failed" && updated.status === "attempt_failed") await queueParcelSms(tx, p.id, "attempt_failed");
    return updated;
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
