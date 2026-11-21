import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Q } from "../db";
import { bags, hubs, manifests, parcels } from "../schema";
import { hubUsers, notify } from "./notify";
import { DomainError, transition, type Actor } from "./parcels";

/**
 * Linehaul: parcels for the same destination hub are packed into bags, bags are loaded on a
 * manifest (one truck run), and the bag is scanned once at each end instead of every parcel.
 *
 *   bag:      open → sealed → in_transit → received
 *   manifest: open → departed → arrived
 */

const destHub = alias(hubs, "dest_hub");

function code(prefix: string) {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return `${prefix}${String(n).padStart(6, "0")}`;
}

/** Hub staff work for one hub; admins for all. */
function atHub(actor: Actor, hubId: string, what: string) {
  if (actor.role === "admin") return;
  if (actor.role !== "hub") throw new DomainError("Only hub staff can do this");
  if (actor.hubId !== hubId) throw new DomainError(`Only staff of that hub can ${what}`);
}

async function route(q: Q, originHubId: string, destHubId: string) {
  if (originHubId === destHubId) throw new DomainError("Origin and destination hub must be different");
  const found = await q.select({ id: hubs.id }).from(hubs).where(inArray(hubs.id, [originHubId, destHubId]));
  if (found.length !== 2) throw new DomainError("Unknown hub");
}

// ---------- bags ----------

export async function createBag(q: Q, a: { originHubId: string; destHubId: string }, actor: Actor) {
  atHub(actor, a.originHubId, "create its bags");
  await route(q, a.originHubId, a.destHubId);
  const [bag] = await q.insert(bags).values({ ...a, code: code("BAG") }).returning();
  return bag;
}

async function openBag(q: Q, bagId: string, actor: Actor) {
  const [bag] = await q.select().from(bags).where(eq(bags.id, bagId)).for("update");
  if (!bag) throw new DomainError("Bag not found");
  atHub(actor, bag.originHubId, "change this bag");
  if (bag.status !== "open") throw new DomainError(`Bag ${bag.code} is ${bag.status.replace("_", " ")} and can no longer be changed`);
  return bag;
}

/** Adds parcels by id or tracking number. Each must be on the floor of the bag's origin hub and bound for its destination hub. */
export async function addToBag(q: Q, a: { bagId: string; parcelIds?: string[]; tracking?: string }, actor: Actor) {
  return q.transaction(async (tx) => {
    const bag = await openBag(tx, a.bagId, actor);
    const cond = a.tracking ? eq(parcels.tracking, a.tracking.trim().toUpperCase()) : inArray(parcels.id, a.parcelIds ?? []);
    const found = await tx.select().from(parcels).where(cond).for("update");
    if (found.length === 0) throw new DomainError(a.tracking ? "No parcel with that tracking number" : "Tick at least one parcel");
    for (const p of found) {
      if (p.bagId === bag.id) continue;
      if (p.bagId) throw new DomainError(`${p.tracking} is already in another bag`);
      if (p.status !== "at_origin_hub" || p.currentHubId !== bag.originHubId) throw new DomainError(`${p.tracking} is not on the floor of this hub`);
      if (p.destHubId !== bag.destHubId) throw new DomainError(`${p.tracking} is not going to this bag's destination hub`);
    }
    await tx.update(parcels).set({ bagId: bag.id }).where(inArray(parcels.id, found.map((p) => p.id)));
    return found.length;
  });
}

export async function removeFromBag(q: Q, a: { bagId: string; parcelId: string }, actor: Actor) {
  return q.transaction(async (tx) => {
    const bag = await openBag(tx, a.bagId, actor);
    await tx.update(parcels).set({ bagId: null }).where(and(eq(parcels.id, a.parcelId), eq(parcels.bagId, bag.id)));
  });
}

export async function sealBag(q: Q, bagId: string, actor: Actor) {
  return q.transaction(async (tx) => {
    const bag = await openBag(tx, bagId, actor);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(parcels).where(eq(parcels.bagId, bag.id));
    if (n === 0) throw new DomainError("An empty bag cannot be sealed");
    await tx.update(bags).set({ status: "sealed", sealedAt: new Date() }).where(eq(bags.id, bag.id));
  });
}

/** Scanning a bag in at its destination moves every parcel inside to "at destination hub". */
export async function receiveBag(q: Q, key: { id: string } | { code: string }, actor: Actor) {
  return q.transaction(async (tx) => {
    const cond = "id" in key ? eq(bags.id, key.id) : eq(bags.code, key.code.trim().toUpperCase());
    const [bag] = await tx.select().from(bags).where(cond).for("update");
    if (!bag) throw new DomainError("Bag not found");
    atHub(actor, bag.destHubId, "receive this bag");
    if (bag.status !== "in_transit") throw new DomainError(`Bag ${bag.code} is ${bag.status.replace("_", " ")}: it has not left on a manifest`);
    const inside = await tx.select({ id: parcels.id }).from(parcels).where(and(eq(parcels.bagId, bag.id), eq(parcels.status, "in_transit")));
    for (const p of inside) {
      await transition(tx, { parcelId: p.id, to: "at_destination_hub", actor, viaBag: true, note: `Bag ${bag.code}` });
    }
    await tx.update(bags).set({ status: "received", receivedAt: new Date() }).where(eq(bags.id, bag.id));
    if (bag.manifestId) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(bags)
        .where(and(eq(bags.manifestId, bag.manifestId), sql`${bags.status} <> 'received'`));
      if (n === 0) await tx.update(manifests).set({ status: "arrived", arrivedAt: new Date() }).where(eq(manifests.id, bag.manifestId));
    }
    return { code: bag.code, parcels: inside.length };
  });
}

const bagView = {
  id: bags.id,
  code: bags.code,
  status: bags.status,
  originHubId: bags.originHubId,
  destHubId: bags.destHubId,
  origin: hubs.name,
  dest: destHub.name,
  manifestId: bags.manifestId,
  manifestCode: manifests.code,
  createdAt: bags.createdAt,
  parcels: sql<number>`(select count(*)::int from parcels p where p.bag_id = bags.id)`,
  cod: sql<number>`(select coalesce(sum(p.cod_amount), 0)::int from parcels p where p.bag_id = bags.id)`,
};

function bagQuery(q: Q) {
  return q
    .select(bagView)
    .from(bags)
    .innerJoin(hubs, eq(bags.originHubId, hubs.id))
    .innerJoin(destHub, eq(bags.destHubId, destHub.id))
    .leftJoin(manifests, eq(bags.manifestId, manifests.id));
}

export type BagStatus = (typeof bags.$inferSelect)["status"];
export type BagView = Awaited<ReturnType<typeof listBags>>[number];

export function listBags(q: Q, f: { status?: BagStatus[]; manifestId?: string; unassigned?: { originHubId: string; destHubId: string } } = {}) {
  const where = [];
  if (f.status) where.push(inArray(bags.status, f.status));
  if (f.manifestId) where.push(eq(bags.manifestId, f.manifestId));
  if (f.unassigned) {
    where.push(isNull(bags.manifestId), eq(bags.status, "sealed"), eq(bags.originHubId, f.unassigned.originHubId), eq(bags.destHubId, f.unassigned.destHubId));
  }
  return bagQuery(q).where(where.length ? and(...where) : undefined).orderBy(desc(bags.createdAt)).limit(200);
}

export async function getBag(q: Q, id: string) {
  const [bag] = await bagQuery(q).where(eq(bags.id, id));
  return bag ?? null;
}

// ---------- manifests ----------

export async function createManifest(q: Q, a: { originHubId: string; destHubId: string; vehicle?: string; driver?: string }, actor: Actor) {
  atHub(actor, a.originHubId, "create its manifests");
  await route(q, a.originHubId, a.destHubId);
  const [m] = await q
    .insert(manifests)
    .values({ originHubId: a.originHubId, destHubId: a.destHubId, vehicle: a.vehicle?.trim() ?? "", driver: a.driver?.trim() ?? "", code: code("MAN") })
    .returning();
  return m;
}

async function openManifest(q: Q, id: string, actor: Actor) {
  const [m] = await q.select().from(manifests).where(eq(manifests.id, id)).for("update");
  if (!m) throw new DomainError("Manifest not found");
  atHub(actor, m.originHubId, "change this manifest");
  if (m.status !== "open") throw new DomainError(`Manifest ${m.code} has already ${m.status}`);
  return m;
}

export async function addBagsToManifest(q: Q, a: { manifestId: string; bagIds: string[] }, actor: Actor) {
  return q.transaction(async (tx) => {
    const m = await openManifest(tx, a.manifestId, actor);
    if (a.bagIds.length === 0) throw new DomainError("Tick at least one bag");
    const found = await tx.select().from(bags).where(inArray(bags.id, a.bagIds)).for("update");
    for (const b of found) {
      if (b.status !== "sealed") throw new DomainError(`Bag ${b.code} must be sealed first`);
      if (b.manifestId && b.manifestId !== m.id) throw new DomainError(`Bag ${b.code} is already on another manifest`);
      if (b.originHubId !== m.originHubId || b.destHubId !== m.destHubId) throw new DomainError(`Bag ${b.code} is for a different route`);
    }
    await tx.update(bags).set({ manifestId: m.id }).where(inArray(bags.id, found.map((b) => b.id)));
  });
}

export async function removeBagFromManifest(q: Q, a: { manifestId: string; bagId: string }, actor: Actor) {
  return q.transaction(async (tx) => {
    const m = await openManifest(tx, a.manifestId, actor);
    await tx.update(bags).set({ manifestId: null }).where(and(eq(bags.id, a.bagId), eq(bags.manifestId, m.id)));
  });
}

/** The truck leaves: every parcel in every bag becomes "in transit". */
export async function departManifest(q: Q, manifestId: string, actor: Actor) {
  return q.transaction(async (tx) => {
    const m = await openManifest(tx, manifestId, actor);
    const loaded = await tx.select().from(bags).where(eq(bags.manifestId, m.id)).for("update");
    if (loaded.length === 0) throw new DomainError("Load at least one bag before departure");
    const inside = await tx.select({ id: parcels.id }).from(parcels).where(inArray(parcels.bagId, loaded.map((b) => b.id)));
    for (const p of inside) {
      await transition(tx, { parcelId: p.id, to: "in_transit", actor, viaBag: true, note: `Manifest ${m.code}` });
    }
    await tx.update(bags).set({ status: "in_transit" }).where(eq(bags.manifestId, m.id));
    await tx.update(manifests).set({ status: "departed", departedAt: new Date() }).where(eq(manifests.id, m.id));
    // Warn the receiving hub so they can expect the truck.
    const [origin] = await tx.select({ name: hubs.name }).from(hubs).where(eq(hubs.id, m.originHubId));
    await notify(tx, await hubUsers(tx, m.destHubId), "manifest", { code: m.code, origin: origin?.name ?? "", n: loaded.length }, { manifestId: m.id }, `${m.id}:departed`);
    return { code: m.code, bags: loaded.length, parcels: inside.length };
  });
}

const manifestView = {
  id: manifests.id,
  code: manifests.code,
  status: manifests.status,
  originHubId: manifests.originHubId,
  destHubId: manifests.destHubId,
  origin: hubs.name,
  dest: destHub.name,
  vehicle: manifests.vehicle,
  driver: manifests.driver,
  createdAt: manifests.createdAt,
  departedAt: manifests.departedAt,
  arrivedAt: manifests.arrivedAt,
  bags: sql<number>`(select count(*)::int from bags b where b.manifest_id = manifests.id)`,
  parcels: sql<number>`(select count(*)::int from parcels p join bags b on p.bag_id = b.id where b.manifest_id = manifests.id)`,
};

function manifestQuery(q: Q) {
  return q.select(manifestView).from(manifests).innerJoin(hubs, eq(manifests.originHubId, hubs.id)).innerJoin(destHub, eq(manifests.destHubId, destHub.id));
}

export type ManifestView = Awaited<ReturnType<typeof listManifests>>[number];

export const listManifests = (q: Q) => manifestQuery(q).orderBy(desc(manifests.createdAt)).limit(100);

export async function getManifest(q: Q, id: string) {
  const [m] = await manifestQuery(q).where(eq(manifests.id, id));
  return m ?? null;
}
