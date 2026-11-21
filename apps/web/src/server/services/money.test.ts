import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth";
import { memoryDb, type DB } from "../db";
import { ledgerLines, merchants, users } from "../schema";
import { seedReference } from "../seed";
import { deliver } from "./delivery";
import { acct, balance, courierCash, merchantOwed } from "./ledger";
import {
  batchCsv,
  cancelPayout,
  checkPayoutAccount,
  createBatch,
  getBatch,
  listPayoutRequests,
  markBatchPaid,
  monthlyStatement,
  paySheet,
  payoutAvailable,
  receiveCash,
  recordPay,
  removeFromBatch,
  requestPayout,
  resolveShortfall,
  setPayoutDetails,
  setPayRates,
} from "./money";
import { createParcel, transition, type Actor } from "./parcels";

let db: DB;
let admin: Actor, hub: Actor, courier: Actor, merchant: Actor, otherHub: Actor;
const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers", year: "numeric", month: "2-digit" }).format(new Date());

beforeAll(async () => {
  db = await memoryDb();
  const hubId = await seedReference(db);
  const [m] = await db.insert(merchants).values({ name: "Shop", phone: "0550 00 00 01", wilayaId: 16 }).returning();
  const pw = await hashPassword("x");
  const mk = async (role: Actor["role"], email: string, h: string | null, merchantId: string | null = null): Promise<Actor> => {
    const [u] = await db.insert(users).values({ name: email, email, role, passwordHash: pw, merchantId, hubId: h }).returning();
    return { userId: u.id, role, merchantId, hubId: h };
  };
  admin = await mk("admin", "a@x", null);
  hub = await mk("hub", "h@x", hubId.ALG);
  otherHub = await mk("hub", "o@x", hubId.ORN);
  courier = await mk("courier", "c@x", hubId.ALG);
  merchant = await mk("merchant", "m@x", null, m.id);
  // Three delivered parcels: 3 × (5000 − 400 local fee) owed to the merchant, 15,000 held by the courier.
  for (let i = 0; i < 3; i++) {
    const p = await createParcel(db, { merchantId: m.id, recipientName: "R", recipientPhone: "0550 12 34 56", destWilayaId: 16, communeId: 1601, address: "Rue", weightKg: 1, codAmount: 5000 }, merchant);
    await transition(db, { parcelId: p.id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
    await transition(db, { parcelId: p.id, to: "picked_up", actor: courier });
    await transition(db, { parcelId: p.id, to: "at_origin_hub", actor: hub });
    await transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
    await deliver(db, { parcelId: p.id, actor: courier });
  }
});

const ledgerSum = async () => (await db.select({ s: sql<number>`coalesce(sum(${ledgerLines.amount}),0)::int` }).from(ledgerLines))[0].s;

describe("payout details", () => {
  it("accepts a CCP account with its key and a 20-digit RIB", () => {
    expect(checkPayoutAccount("ccp", "0012345678 90")).toBe("0012345678 90");
    expect(checkPayoutAccount("bank", "00799999001234567890")).toBe("007 99999 0012345678 90");
    expect(() => checkPayoutAccount("bank", "123")).toThrow(/20 digits/);
  });
});

describe("cash check at the hub", () => {
  it("records a shortfall that stays on the courier until settled", async () => {
    expect(await courierCash(db, courier.userId)).toBe(15000);
    await expect(receiveCash(db, { courierId: courier.userId, counted: 14000 }, otherHub)).rejects.toThrow(/another hub/);
    const h = await receiveCash(db, { courierId: courier.userId, counted: 14000, note: "Short one note" }, hub);
    expect(h.difference).toBe(1000);
    expect(await courierCash(db, courier.userId)).toBe(1000);
    expect(await balance(db, acct.companyCash)).toBe(14000);
    await resolveShortfall(db, h.id, "deducted", admin);
    await expect(resolveShortfall(db, h.id, "written_off", admin)).rejects.toThrow(/already settled/);
    expect(await ledgerSum()).toBe(0);
  });

  it("holds an excess aside instead of losing it", async () => {
    // The courier holds 1,000 (the shortfall) but hands in 1,200.
    const h = await receiveCash(db, { courierId: courier.userId, counted: 1200 }, hub);
    expect(h.difference).toBe(-200);
    expect(await balance(db, "suspense:cash_over")).toBe(-200);
    expect(await courierCash(db, courier.userId)).toBe(0);
    expect(await ledgerSum()).toBe(0);
  });
});

describe("payouts", () => {
  it("needs payout details, then lets the merchant ask for up to what is owed", async () => {
    await expect(requestPayout(db, merchant.merchantId!, 5000, merchant)).rejects.toThrow(/CCP or bank account first/);
    await setPayoutDetails(db, merchant.merchantId!, { method: "ccp", account: "0012345678 90", holder: "Shop SARL" });
    expect((await payoutAvailable(db, merchant.merchantId!)).available).toBe(13800);
    await expect(requestPayout(db, merchant.merchantId!, 500, merchant)).rejects.toThrow(/smallest payout/);
    await expect(requestPayout(db, merchant.merchantId!, 20000, merchant)).rejects.toThrow(/at most 13,800/);
    const a = await requestPayout(db, merchant.merchantId!, 10000, merchant);
    expect(a.code).toMatch(/^PO-\d{6}$/);
    expect((await payoutAvailable(db, merchant.merchantId!)).available).toBe(3800);
    const b = await requestPayout(db, merchant.merchantId!, 3000, merchant);
    await cancelPayout(db, b.id, merchant);
    await expect(cancelPayout(db, a.id, admin)).rejects.toThrow(/Say why/);
  });

  it("batches requests, exports them, and only moves money when marked paid", async () => {
    const before = await merchantOwed(db, merchant.merchantId!);
    const batch = await createBatch(db, admin);
    expect(batch.total).toBe(10000);
    expect(await merchantOwed(db, merchant.merchantId!)).toBe(before);
    const csv = await batchCsv(db, batch.id);
    expect(csv.split("\r\n")[1]).toContain('"Shop SARL","CCP","0012345678 90","10000"');
    await expect(markBatchPaid(db, batch.id, " ", admin)).rejects.toThrow(/reference/);
    await markBatchPaid(db, batch.id, "CCP-TRF-2026-1121", admin);
    expect(await merchantOwed(db, merchant.merchantId!)).toBe(before - 10000);
    expect((await listPayoutRequests(db, { batchId: batch.id }))[0].status).toBe("paid");
    await expect(markBatchPaid(db, batch.id, "again", admin)).rejects.toThrow(/already marked paid/);
    expect(await ledgerSum()).toBe(0);
  });

  it("can take a request back out of an unpaid list", async () => {
    const r = await requestPayout(db, merchant.merchantId!, 1000, merchant);
    const b = await createBatch(db, admin);
    await removeFromBatch(db, r.id);
    expect((await listPayoutRequests(db, { merchantId: merchant.merchantId })).find((x) => x.id === r.id)!.status).toBe("requested");
    expect(b.total).toBe(1000);
    expect((await getBatch(db, b.id))!).toMatchObject({ total: 0, count: 0 });
  });
});

describe("courier pay", () => {
  it("pays per delivery and pickup, adds the bonus, takes the deducted shortfall, once", async () => {
    await setPayRates(db, { perDelivery: 150, perPickup: 50, bonusThreshold: 90, bonus: 3000 });
    const [row] = await paySheet(db, month);
    expect(row).toMatchObject({ deliveries: 3, pickups: 3, failed: 0, success: 100, base: 600, bonus: 3000, deductions: 1000, total: 2600, paid: false });
    await recordPay(db, month, courier.userId, admin);
    expect((await paySheet(db, month))[0].paid).toBe(true);
    await expect(recordPay(db, month, courier.userId, admin)).rejects.toThrow(/already recorded/);
    expect(await balance(db, "expense:courier_pay")).toBe(3600);
    expect(await ledgerSum()).toBe(0);
  });
});

describe("monthly statement", () => {
  it("matches the wallet", async () => {
    const s = (await monthlyStatement(db, merchant.merchantId!, month))!;
    expect(s).toMatchObject({ delivered: 3, codCollected: 15000, deliveryFees: 1200, returns: 0, payouts: 10000, opening: 0 });
    expect(s.closing).toBe(await merchantOwed(db, merchant.merchantId!));
    const [m] = await db.select().from(merchants).where(eq(merchants.id, merchant.merchantId!));
    expect(m.payoutHolder).toBe("Shop SARL");
  });
});
