import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth";
import { memoryDb, type DB } from "../db";
import { quote } from "../domain/pricing";
import { canTransition, nextStatuses } from "../domain/state";
import { merchants, users } from "../schema";
import { seedReference } from "../seed";
import { balance, acct, courierCash, handover, merchantOwed, payout } from "./ledger";
import { createParcel, getParcel, transition, type Actor } from "./parcels";

let db: DB;
let admin: Actor, hub: Actor, courier: Actor, other: Actor, merchant: Actor;

beforeAll(async () => {
  db = await memoryDb();
  const hubId = await seedReference(db);
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
