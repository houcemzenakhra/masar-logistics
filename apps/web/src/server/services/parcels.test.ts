import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth";
import { memoryDb, type DB } from "../db";
import { quote } from "../domain/pricing";
import { canTransition, nextStatuses } from "../domain/state";
import { merchants, users } from "../schema";
import { seedReference } from "../seed";
import { balance, acct, courierCash, handover, merchantOwed, payout } from "./ledger";
import { optimise, pathKm } from "../domain/route";
import { hubs } from "../schema";
import { eq } from "drizzle-orm";
import { addBagsToManifest, addToBag, createBag, createManifest, departManifest, getManifest, receiveBag, sealBag } from "./linehaul";
import { createParcel, getParcel, listParcels, transition, type Actor } from "./parcels";
import { optimiseCourierRoute } from "./routes";
import { registerMerchant, setMerchantStatus } from "./signup";

let db: DB;
let hubIds: Record<string, string>;
let admin: Actor, hub: Actor, courier: Actor, other: Actor, merchant: Actor;

beforeAll(async () => {
  db = await memoryDb();
  const hubId = (hubIds = await seedReference(db));
  const [m] = await db.insert(merchants).values({ name: "Shop", phone: "0", wilayaId: 16 }).returning();
  const pw = await hashPassword("x");
  const mk = async (role: Actor["role"], email: string, merchantId: string | null = null): Promise<Actor> => {
    const [u] = await db.insert(users).values({ name: email, email, role, passwordHash: pw, merchantId, hubId: hubId.ALG }).returning();
    return { userId: u.id, role, merchantId, hubId: hubId.ALG };
  };
  admin = await mk("admin", "a@x");
  hub = await mk("hub", "h@x");
  courier = await mk("courier", "c@x");
  other = await mk("courier", "c2@x");
  merchant = await mk("merchant", "m@x", m.id);
});

const order = (destWilayaId: number, codAmount = 5000, weightKg = 2) =>
  createParcel(db, { merchantId: merchant.merchantId!, recipientName: "R", recipientPhone: "0555", destWilayaId, commune: "C", address: "A", weightKg, codAmount }, merchant);

async function toDoorstep(id: string) {
  await transition(db, { parcelId: id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
  await transition(db, { parcelId: id, to: "picked_up", actor: courier });
  await transition(db, { parcelId: id, to: "at_origin_hub", actor: hub });
  await transition(db, { parcelId: id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
}

describe("state machine", () => {
  it("only allows defined transitions per role", () => {
    expect(canTransition("created", "delivered", "admin")).toBe(false);
    expect(canTransition("out_for_delivery", "delivered", "courier")).toBe(true);
    expect(canTransition("out_for_delivery", "delivered", "merchant")).toBe(false);
    expect(nextStatuses("delivered", "admin")).toEqual([]);
  });
});

describe("pricing", () => {
  it("charges extra kilos above the included weight", () => {
    const tier = { key: "north" as const, label: "North", base: 600, perExtraKg: 50, returnFee: 250 };
    expect(quote(tier, 5).deliveryFee).toBe(600);
    expect(quote(tier, 7.2).deliveryFee).toBe(750);
  });
  it("prices by destination zone", async () => {
    expect((await order(16)).deliveryFee).toBe(400);
    expect((await order(31)).deliveryFee).toBe(600);
    expect((await order(30)).deliveryFee).toBe(1100);
  });
});

describe("parcel lifecycle", () => {
  it("delivers a local parcel and books the cash", async () => {
    const p = await order(16, 5000);
    const before = await courierCash(db, courier.userId);
    const owedBefore = await merchantOwed(db, merchant.merchantId!);
    await toDoorstep(p.id);
    const done = await transition(db, { parcelId: p.id, to: "delivered", actor: courier });
    expect(done.status).toBe("delivered");
    expect((await courierCash(db, courier.userId)) - before).toBe(5000);
    expect((await merchantOwed(db, merchant.merchantId!)) - owedBefore).toBe(5000 - 400);
    expect((await getParcel(db, { id: p.id }))!.events).toHaveLength(6);
  });

  it("rejects skipping steps, strangers and wrong couriers", async () => {
    const p = await order(16);
    await expect(transition(db, { parcelId: p.id, to: "delivered", actor: admin })).rejects.toThrow(/cannot move/);
    await toDoorstep(p.id);
    await expect(transition(db, { parcelId: p.id, to: "delivered", actor: other })).rejects.toThrow(/not assigned/);
    await expect(transition(db, { parcelId: p.id, to: "delivered", actor: merchant })).rejects.toThrow(/cannot move/);
  });

  it("routes inter-hub parcels through the destination hub", async () => {
    const p = await order(31);
    await transition(db, { parcelId: p.id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
    await transition(db, { parcelId: p.id, to: "picked_up", actor: courier });
    await transition(db, { parcelId: p.id, to: "at_origin_hub", actor: hub });
    await expect(transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId })).rejects.toThrow(/destination hub/);
    await transition(db, { parcelId: p.id, to: "in_transit", actor: hub });
    const at = await transition(db, { parcelId: p.id, to: "at_destination_hub", actor: hub });
    expect(at.currentHubId).toBe(p.destHubId);
  });

  it("is idempotent for retried device requests", async () => {
    const p = await order(16, 3000);
    await toDoorstep(p.id);
    const before = await courierCash(db, courier.userId);
    await transition(db, { parcelId: p.id, to: "delivered", actor: courier, idempotencyKey: "k1" });
    await transition(db, { parcelId: p.id, to: "delivered", actor: courier, idempotencyKey: "k1" });
    expect((await courierCash(db, courier.userId)) - before).toBe(3000);
  });

  it("returns a parcel automatically after three failed attempts and charges the return fee", async () => {
    const p = await order(16);
    await toDoorstep(p.id);
    const owed = await merchantOwed(db, merchant.merchantId!);
    await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier });
    await transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
    await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier });
    await transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
    const third = await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier });
    expect(third.status).toBe("return_initiated");
    await transition(db, { parcelId: p.id, to: "returned", actor: hub });
    expect(owed - (await merchantOwed(db, merchant.merchantId!))).toBe(200);
  });
});

describe("ledger", () => {
  it("moves cash courier -> company -> merchant and never overdraws", async () => {
    const held = await courierCash(db, courier.userId);
    expect(held).toBeGreaterThan(0);
    await expect(handover(db, { courierId: courier.userId, amount: held + 1, by: admin.userId })).rejects.toThrow(/only holds/);
    await handover(db, { courierId: courier.userId, amount: held, by: admin.userId });
    expect(await courierCash(db, courier.userId)).toBe(0);
    expect(await balance(db, acct.companyCash)).toBe(held);
    const owed = await merchantOwed(db, merchant.merchantId!);
    await expect(payout(db, { merchantId: merchant.merchantId!, amount: owed + 1, by: admin.userId })).rejects.toThrow(/owed/);
    await payout(db, { merchantId: merchant.merchantId!, amount: owed, by: admin.userId });
    expect(await merchantOwed(db, merchant.merchantId!)).toBe(0);
  });
});

describe("commune directory", () => {
  it("loads all 69 wilayas and 1,541 communes, and is safe to run twice", async () => {
    await seedReference(db);
    const { communes, wilayas } = await import("../schema");
    expect((await db.select().from(wilayas)).length).toBe(69);
    expect((await db.select().from(communes)).length).toBe(1541);
  });
  it("takes the commune name from the directory and rejects a commune from another wilaya", async () => {
    const base = { merchantId: merchant.merchantId!, recipientName: "R", recipientPhone: "0555", address: "A", weightKg: 1, codAmount: 0 };
    const p = await createParcel(db, { ...base, destWilayaId: 31, communeId: 3101 }, merchant);
    expect(p.commune).toBe("Oran");
    await expect(createParcel(db, { ...base, destWilayaId: 16, communeId: 3101 }, merchant)).rejects.toThrow(/not in the chosen wilaya/);
  });
});

describe("bags and manifests", () => {
  it("moves a bag of parcels between hubs as one unit", async () => {
    const mk = async () => {
      const p = await createParcel(db, { merchantId: merchant.merchantId!, recipientName: "R", recipientPhone: "0555", destWilayaId: 31, communeId: 3101, address: "A", weightKg: 1, codAmount: 1000 }, merchant);
      await transition(db, { parcelId: p.id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
      await transition(db, { parcelId: p.id, to: "picked_up", actor: courier });
      await transition(db, { parcelId: p.id, to: "at_origin_hub", actor: hub });
      return p;
    };
    const [a, b] = [await mk(), await mk()];
    const local = await order(16);
    const bag = await createBag(db, { originHubId: hubIds.ALG, destHubId: hubIds.ORN }, hub);
    await expect(sealBag(db, bag.id, hub)).rejects.toThrow(/empty/);
    await expect(addToBag(db, { bagId: bag.id, parcelIds: [local.id] }, hub)).rejects.toThrow(/not on the floor/);
    await addToBag(db, { bagId: bag.id, parcelIds: [a.id] }, hub);
    await addToBag(db, { bagId: bag.id, tracking: b.tracking }, hub);
    // A bagged parcel cannot be scanned out on its own.
    await expect(transition(db, { parcelId: a.id, to: "in_transit", actor: hub })).rejects.toThrow(/is in bag/);

    const man = await createManifest(db, { originHubId: hubIds.ALG, destHubId: hubIds.ORN, vehicle: "16-12345", driver: "D" }, hub);
    await expect(addBagsToManifest(db, { manifestId: man.id, bagIds: [bag.id] }, hub)).rejects.toThrow(/sealed first/);
    await sealBag(db, bag.id, hub);
    await expect(addToBag(db, { bagId: bag.id, parcelIds: [a.id] }, hub)).rejects.toThrow(/no longer be changed/);
    await addBagsToManifest(db, { manifestId: man.id, bagIds: [bag.id] }, hub);
    expect(await departManifest(db, man.id, hub)).toMatchObject({ bags: 1, parcels: 2 });
    expect((await getParcel(db, { id: a.id }))!.status).toBe("in_transit");

    // Staff of the origin hub cannot receive at the destination.
    await expect(receiveBag(db, { code: bag.code }, hub)).rejects.toThrow(/Only staff of that hub/);
    expect(await receiveBag(db, { code: bag.code }, admin)).toMatchObject({ parcels: 2 });
    expect((await getParcel(db, { id: b.id }))!.status).toBe("at_destination_hub");
    expect((await getManifest(db, man.id))!.status).toBe("arrived");
    await expect(receiveBag(db, { code: bag.code }, admin)).rejects.toThrow(/has not left/);
  });
});

describe("route optimisation", () => {
  it("never does worse than visiting stops in the given order", () => {
    const start = { lat: 36.75, lng: 3.06 };
    const stops = [[36.72, 3.2], [36.48, 2.83], [36.77, 3.25], [36.47, 2.8], [36.74, 3.1], [36.7, 3.0]].map(([lat, lng], id) => ({ id, lat, lng }));
    const r = optimise(start, stops);
    expect(r.order).toHaveLength(stops.length);
    expect(new Set(r.order.map((s) => s.id)).size).toBe(stops.length);
    expect(r.km).toBeLessThan(pathKm(start, stops));
    // The two far western stops (Blida side) end up next to each other.
    const pos = (id: number) => r.order.findIndex((s) => s.id === id);
    expect(Math.abs(pos(1) - pos(3))).toBe(1);
  });

  it("orders a courier's deliveries from the hub outwards", async () => {
    const [h] = await db.select().from(hubs).where(eq(hubs.id, hubIds.ALG));
    expect(h.lat).not.toBeNull();
    const ids: string[] = [];
    // Communes of Alger: far east (Reghaia 1643), centre (1601), far west (Zeralda 1646), centre again.
    for (const communeId of [1643, 1601, 1646, 1601]) {
      const p = await createParcel(db, { merchantId: merchant.merchantId!, recipientName: "R", recipientPhone: "0555", destWilayaId: 16, communeId, address: "A", weightKg: 1, codAmount: 0 }, merchant);
      await transition(db, { parcelId: p.id, to: "pickup_assigned", actor: admin, courierId: other.userId });
      await transition(db, { parcelId: p.id, to: "picked_up", actor: other });
      await transition(db, { parcelId: p.id, to: "at_origin_hub", actor: hub });
      await transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: other.userId });
      ids.push(p.id);
    }
    const r = await optimiseCourierRoute(db, other.userId);
    expect(r).toMatchObject({ parcels: 4, stops: 3 });
    const run = await listParcels(db, { courierId: other.userId, status: "out_for_delivery" });
    expect(run.map((p) => p.routeSeq)).toEqual([1, 2, 3, 4]);
    // Both city-centre parcels come first and together, since the hub is in Alger centre.
    expect(run.slice(0, 2).map((p) => p.communeId)).toEqual([1601, 1601]);
    // Delivering a parcel takes it off the route.
    const done = await transition(db, { parcelId: run[0].id, to: "delivered", actor: other });
    expect(done.routeSeq).toBeNull();
  });
});

describe("merchant signup", () => {
  const form = { businessName: "New Shop", contactName: "Owner", email: "Owner@Shop.dz", phone: "0550 00 00 00", wilayaId: 31, communeId: 3101, address: "1 rue X", password: "long-enough-pw" };
  it("creates a pending merchant that cannot ship until approved", async () => {
    const { session } = await registerMerchant(db, form);
    expect(session.role).toBe("merchant");
    expect(session.email).toBe("owner@shop.dz");
    const actor = { ...session };
    const input = { merchantId: session.merchantId!, recipientName: "R", recipientPhone: "0555", destWilayaId: 16, communeId: 1601, address: "A", weightKg: 1, codAmount: 0 };
    await expect(createParcel(db, input, actor)).rejects.toThrow(/waiting for approval/);
    await setMerchantStatus(db, session.merchantId!, "active");
    expect((await createParcel(db, input, actor)).deliveryFee).toBe(600);
  });
  it("rejects a duplicate email and a mismatched commune", async () => {
    await expect(registerMerchant(db, form)).rejects.toThrow(/already exists/);
    await expect(registerMerchant(db, { ...form, email: "b@shop.dz", communeId: 1601 })).rejects.toThrow(/not in the chosen wilaya/);
  });
});
