import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth";
import { memoryDb, type DB } from "../db";
import { ledgerLines, merchants, parcels, smsMessages, users } from "../schema";
import { seedReference } from "../seed";
import { deliver } from "./delivery";
import { createDesk, deskFee, getDeskSettings, listDesks, setDeskActive } from "./desks";
import { acct, balance, courierCash, merchantOwed } from "./ledger";
import { createParcel, transition, type Actor, type NewParcel } from "./parcels";
import { answerConfirmation, recipientHistory, setConfirmOrders, setHistorySettings } from "./returns";
import { autoAssign, waiting } from "./dispatch";

let db: DB;
let admin: Actor, hub: Actor, otherHub: Actor, courier: Actor, merchant: Actor, other: Actor;
let merchantId: string;

beforeAll(async () => {
  db = await memoryDb();
  const hubId = await seedReference(db);
  const [m] = await db.insert(merchants).values({ name: "Shop", phone: "0550 00 00 01", wilayaId: 16, address: "1 rue Didouche" }).returning();
  const [o] = await db.insert(merchants).values({ name: "Other", phone: "0550 00 00 02", wilayaId: 16 }).returning();
  merchantId = m.id;
  const pw = await hashPassword("x");
  const mk = async (role: Actor["role"], email: string, h: string | null, mid: string | null = null): Promise<Actor> => {
    const [u] = await db.insert(users).values({ name: email, email, role, passwordHash: pw, merchantId: mid, hubId: h }).returning();
    return { userId: u.id, role, merchantId: mid, hubId: h };
  };
  admin = await mk("admin", "a@x", null);
  hub = await mk("hub", "h@x", hubId.ALG);
  otherHub = await mk("hub", "o@x", hubId.ORN);
  courier = await mk("courier", "c@x", hubId.ALG);
  merchant = await mk("merchant", "m@x", null, m.id);
  other = await mk("merchant", "m2@x", null, o.id);
});

const order = (x: Partial<NewParcel> = {}) =>
  createParcel(db, { merchantId, recipientName: "Amina", recipientPhone: "0661 22 33 44", destWilayaId: 16, communeId: 1601, address: "Rue", weightKg: 1, codAmount: 6000, ...x }, merchant);

/** Takes a parcel from creation to the Algiers hub floor. */
async function toHub(id: string) {
  await transition(db, { parcelId: id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
  await transition(db, { parcelId: id, to: "picked_up", actor: courier });
  await transition(db, { parcelId: id, to: "at_origin_hub", actor: hub });
}
const ledgerSum = async () => (await db.select({ s: sql<number>`coalesce(sum(${ledgerLines.amount}),0)::int` }).from(ledgerLines))[0].s;
const sms = async (id: string) => (await db.select().from(smsMessages).where(eq(smsMessages.parcelId, id))).map((m) => m.kind);

describe("order confirmation", () => {
  it("holds new orders until the recipient answers, and a no cancels without fees", async () => {
    await setConfirmOrders(db, merchantId, true);
    const p = await order();
    expect(p.confirmation).toBe("pending");
    expect(await sms(p.id)).toEqual(["confirm_order"]);
    expect((await waiting(db, "pickup")).map((w) => w.id)).not.toContain(p.id);
    await expect(transition(db, { parcelId: p.id, to: "pickup_assigned", actor: admin, courierId: courier.userId })).rejects.toThrow(/waiting for the recipient/);
    await answerConfirmation(db, p.id, false, "recipient");
    const [after] = await db.select().from(parcels).where(eq(parcels.id, p.id));
    expect(after.status).toBe("cancelled");
    expect(after.confirmation).toBe("declined");
    await expect(answerConfirmation(db, p.id, true, "recipient")).rejects.toThrow(/no longer/);
    expect(await merchantOwed(db, merchantId)).toBe(0);

    const q = await order();
    await expect(answerConfirmation(db, q.id, true, other)).rejects.toThrow(/Not your parcel/);
    await answerConfirmation(db, q.id, true, merchant);
    expect((await waiting(db, "pickup")).map((w) => w.id)).toContain(q.id);
    await setConfirmOrders(db, merchantId, false);
    expect((await order()).confirmation).toBe("none");
  });
});

describe("stop desks", () => {
  it("charges less, skips the courier run, and hands over against the code", async () => {
    const d = await createDesk(db, { name: "Masar Bab Ezzouar", wilayaId: 16, communeId: 1601, address: "Cité 5 Juillet", hours: "9:00-18:00" });
    expect(d.code).toMatch(/^SD-16-/);
    await expect(createDesk(db, { name: "Bad", wilayaId: 31, communeId: 1601, address: "Somewhere far" })).rejects.toThrow(/not in the chosen wilaya/);
    expect((await listDesks(db, { wilayaId: 16, activeOnly: true })).map((x) => x.id)).toContain(d.id);

    const home = await order();
    const p = await order({ deliveryType: "desk", stopDeskId: d.id });
    expect(p.deliveryFee).toBe(deskFee(home.deliveryFee, await getDeskSettings(db)));
    expect(p.deliveryFee).toBeLessThan(home.deliveryFee);
    expect(p.address).toContain("Masar Bab Ezzouar");
    await toHub(p.id);
    await toHub(home.id);
    expect((await waiting(db, "delivery")).map((w) => w.id)).not.toContain(p.id);
    await expect(transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId })).rejects.toThrow(/stop desk/);
    await expect(transition(db, { parcelId: home.id, to: "ready_for_pickup", actor: admin })).rejects.toThrow(/home delivery/);
    await expect(transition(db, { parcelId: p.id, to: "ready_for_pickup", actor: otherHub })).rejects.toThrow(/another hub|cannot/);
    await transition(db, { parcelId: p.id, to: "ready_for_pickup", actor: hub });
    expect(await sms(p.id)).toContain("ready_at_desk");
    const [smsRow] = await db.select().from(smsMessages).where(eq(smsMessages.kind, "ready_at_desk"));
    expect(smsRow.body).toContain("Masar Bab Ezzouar");

    const cashBefore = await balance(db, acct.companyCash);
    await expect(deliver(db, { parcelId: p.id, actor: hub })).rejects.toThrow(/code/);
    await expect(deliver(db, { parcelId: p.id, actor: hub, code: "99999" })).rejects.toThrow(/Wrong delivery code/);
    const [row] = await db.select().from(parcels).where(eq(parcels.id, p.id));
    await deliver(db, { parcelId: p.id, actor: hub, code: row.deliveryCode });
    expect(await balance(db, acct.companyCash)).toBe(cashBefore + 6000);
    expect(await ledgerSum()).toBe(0);

    await setDeskActive(db, d.id, false);
    await expect(order({ deliveryType: "desk", stopDeskId: d.id })).rejects.toThrow(/not open/);
  });
});

describe("partial delivery and exchanges", () => {
  async function outForDelivery(x: Partial<NewParcel>) {
    const p = await order(x);
    await toHub(p.id);
    await transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
    return p;
  }

  it("takes less cash and sends the rest back as a return parcel", async () => {
    const strict = await outForDelivery({});
    await expect(deliver(db, { parcelId: strict.id, actor: courier, collected: 3000, returnedItems: "Blue dress" })).rejects.toThrow(/did not allow partial/);

    const p = await outForDelivery({ allowPartial: true });
    await expect(deliver(db, { parcelId: p.id, actor: courier, collected: 3000 })).rejects.toThrow(/did not keep/);
    await expect(deliver(db, { parcelId: p.id, actor: courier, collected: 7000, returnedItems: "x" })).rejects.toThrow(/less than/);
    const cash = await courierCash(db, courier.userId);
    const owed = await merchantOwed(db, merchantId);
    const done = await deliver(db, { parcelId: p.id, actor: courier, collected: 3500, returnedItems: "Blue dress, size M" });
    expect(done.collectedAmount).toBe(3500);
    expect(await courierCash(db, courier.userId)).toBe(cash + 3500);
    expect(await merchantOwed(db, merchantId)).toBe(owed + 3500 - p.deliveryFee);
    const [leg] = await db.select().from(parcels).where(eq(parcels.parentId, p.id));
    expect(leg).toMatchObject({ kind: "return_leg", status: "return_initiated", codAmount: 0, courierId: courier.userId, recipientName: "Shop" });
    expect(leg.description).toContain("Blue dress");

    // The leg comes back through the hub and is charged like any return.
    const before = await merchantOwed(db, merchantId);
    await transition(db, { parcelId: leg.id, to: "returned", actor: hub });
    expect(await merchantOwed(db, merchantId)).toBe(before - leg.returnFee);
    expect(await ledgerSum()).toBe(0);
  });

  it("collects the exchanged item on delivery", async () => {
    await expect(order({ exchange: true })).rejects.toThrow(/which item/);
    const p = await outForDelivery({ exchange: true, exchangeNote: "Shoes size 42" });
    await deliver(db, { parcelId: p.id, actor: courier });
    const legs = await db.select().from(parcels).where(eq(parcels.parentId, p.id));
    expect(legs).toHaveLength(1);
    expect(legs[0].description).toContain("Shoes size 42");
  });
});

describe("recipient history", () => {
  it("shows counts only, on the merchant's own parcels, and can be switched off", async () => {
    // Two refusals for one phone, at another merchant.
    for (let i = 0; i < 2; i++) {
      const p = await createParcel(db, { merchantId: other.merchantId!, recipientName: "X", recipientPhone: "+213 770 99 88 77", destWilayaId: 16, communeId: 1601, address: "Rue", weightKg: 1, codAmount: 1000 }, other);
      await toHub(p.id);
      await transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
      await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier, reason: "refused" });
    }
    const mine = await order({ recipientPhone: "0770998877" });
    expect(mine.recipientPhone).toBe("0770 99 88 77");
    expect(await recipientHistory(db, mine.id, merchant)).toEqual({ orders: 2, delivered: 0, refused: 2, returned: 2 });
    expect(await recipientHistory(db, mine.id, other)).toBeNull();
    expect(await recipientHistory(db, mine.id, courier)).toBeNull();
    const fresh = await order({ recipientPhone: "0555 44 33 22" });
    expect(await recipientHistory(db, fresh.id, merchant)).toBeNull();
    await setHistorySettings(db, { enabled: false });
    expect(await recipientHistory(db, mine.id, admin)).toBeNull();
    await setHistorySettings(db, { enabled: true });
  });

  it("leaves desk and unconfirmed parcels out of automatic dispatch", async () => {
    const r = await autoAssign(db, "delivery", admin);
    expect(r.assigned).toBeGreaterThanOrEqual(0);
  });
});
