import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth";
import { memoryDb, type DB } from "../db";
import { merchants, users, webhookDeliveries } from "../schema";
import { seedReference } from "../seed";
import { waiting } from "./dispatch";
import { checkRecords, guessPlace, loadRef, mapHeader, shopifyRecords, stageImport } from "./imports";
import {
  MAX_WEBHOOK_ATTEMPTS,
  checkWebhookUrl,
  createApiKey,
  createEndpoint,
  dispatchWebhooks,
  removeEndpoint,
  revokeApiKey,
  signature,
  verifyApiKey,
  verifySignature,
} from "./integrations";
import { DuplicateOrderError, createParcel, transition, type Actor, type NewParcel } from "./parcels";
import { algeriaDay, bookPickup, bookableDays, setPickupDays, weekday } from "./pickups";

let db: DB;
let admin: Actor, merchant: Actor, courier: Actor, hub: Actor;
let merchantId: string;

beforeAll(async () => {
  db = await memoryDb();
  const hubId = await seedReference(db);
  const [m] = await db.insert(merchants).values({ name: "Shop", phone: "0550 00 00 01", wilayaId: 16 }).returning();
  merchantId = m.id;
  const pw = await hashPassword("x");
  const mk = async (role: Actor["role"], email: string, h: string | null, mid: string | null = null): Promise<Actor> => {
    const [u] = await db.insert(users).values({ name: email, email, role, passwordHash: pw, merchantId: mid, hubId: h }).returning();
    return { userId: u.id, role, merchantId: mid, hubId: h };
  };
  admin = await mk("admin", "a@x", null);
  merchant = await mk("merchant", "m@x", null, m.id);
  courier = await mk("courier", "c@x", hubId.ALG);
  hub = await mk("hub", "h@x", hubId.ALG);
});

const order = (x: Partial<NewParcel> = {}) =>
  createParcel(db, { merchantId, recipientName: "Amina", recipientPhone: "0661 22 33 44", destWilayaId: 16, communeId: 1601, address: "Rue", weightKg: 1, codAmount: 3000, ...x }, merchant);

describe("API keys", () => {
  it("acts as the merchant until revoked, and only the hash is kept", async () => {
    const k = await createApiKey(db, { merchantId, userId: merchant.userId, name: "WooCommerce" });
    expect(k.key).toMatch(/^msr_live_[\w-]{32}$/);
    expect(k.hash).not.toContain(k.key.slice(9));
    const s = await verifyApiKey(db, k.key);
    expect(s).toMatchObject({ role: "merchant", merchantId, userId: merchant.userId });
    expect(await verifyApiKey(db, k.key + "x")).toBeNull();
    await revokeApiKey(db, merchantId, k.id);
    expect(await verifyApiKey(db, k.key)).toBeNull();
    await expect(createApiKey(db, { merchantId, userId: merchant.userId, name: "" })).rejects.toThrow(/Name the key/);
  });
});

describe("order numbers", () => {
  it("refuses the same shop order twice", async () => {
    const p = await order({ externalRef: "WC-1001" });
    expect(p.externalRef).toBe("WC-1001");
    const e = await order({ externalRef: "WC-1001" }).catch((x) => x);
    expect(e).toBeInstanceOf(DuplicateOrderError);
    expect(e.tracking).toBe(p.tracking);
  });
});

describe("webhooks", () => {
  it("accepts only public https addresses", () => {
    expect(checkWebhookUrl("https://shop.dz/masar")).toBe("https://shop.dz/masar");
    for (const bad of ["http://shop.dz", "https://localhost/x", "https://192.168.1.4/x", "https://10.0.0.1", "ftp://x.dz", "nonsense"]) expect(() => checkWebhookUrl(bad)).toThrow();
  });

  it("signs, sends, retries with growing delays, and gives up", async () => {
    const ep = await createEndpoint(db, merchantId, "https://shop.dz/hooks/masar");
    const p = await order({ externalRef: "WC-2002" });
    await transition(db, { parcelId: p.id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
    const queued = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.parcelId, p.id));
    expect(queued.map((d) => d.event).sort()).toEqual(["parcel.created", "parcel.status_changed"]);
    const changed = queued.find((d) => d.event === "parcel.status_changed")!.payload as { data: { parcel: Record<string, unknown> } };
    expect(changed.data.parcel).toMatchObject({ tracking: p.tracking, externalRef: "WC-2002", status: "pickup_assigned", previousStatus: "created" });
    expect(JSON.stringify(changed)).not.toContain("0661");

    // A receiver that checks the signature.
    const seen: string[] = [];
    let ok = true;
    const post = async (url: string, init: { body: string; headers: Record<string, string> }) => {
      expect(url).toBe(ep.url);
      expect(verifySignature(ep.secret, init.body, init.headers["masar-signature"])).toBe(true);
      expect(verifySignature("whsec_wrong", init.body, init.headers["masar-signature"])).toBe(false);
      seen.push(init.headers["masar-event"]);
      return { status: ok ? 200 : 503 };
    };
    const now = new Date();
    expect(await dispatchWebhooks(db, { post, now })).toEqual({ sent: 2, failed: 0 });
    expect(seen).toHaveLength(2);

    // A failing receiver: retried later, not sooner, then given up after the last try.
    ok = false;
    await transition(db, { parcelId: p.id, to: "picked_up", actor: courier });
    let t = now.getTime() + 1000;
    expect((await dispatchWebhooks(db, { post, now: new Date(t) })).sent).toBe(0);
    const [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.status, "pending"));
    expect(d.attempts).toBe(1);
    expect(d.nextAttemptAt.getTime()).toBe(t + 60_000);
    expect((await dispatchWebhooks(db, { post, now: new Date(t + 30_000) }))).toEqual({ sent: 0, failed: 0 });
    for (let i = 1; i < MAX_WEBHOOK_ATTEMPTS; i++) {
      t += 2 * 86400_000;
      await dispatchWebhooks(db, { post, now: new Date(t) });
    }
    const [gone] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, d.id));
    expect(gone).toMatchObject({ status: "failed", attempts: MAX_WEBHOOK_ATTEMPTS, responseStatus: 503 });

    // Removed: nothing more is queued or sent.
    await removeEndpoint(db, merchantId, ep.id);
    await transition(db, { parcelId: p.id, to: "at_origin_hub", actor: hub });
    expect((await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.status, "pending")))).toHaveLength(0);
  });

  it("rejects a stale signature", () => {
    const body = '{"a":1}';
    const old = signature("s", body, Math.floor(Date.now() / 1000) - 3600);
    expect(verifySignature("s", body, old)).toBe(false);
    expect(verifySignature("s", body, signature("s", body))).toBe(true);
  });
});

describe("shop exports", () => {
  it("reads a Shopify export, one order per order number", () => {
    const table = [
      ["Name", "Email", "Financial Status", "Total", "Lineitem quantity", "Lineitem name", "Shipping Name", "Shipping Address1", "Shipping Address2", "Shipping City", "Shipping Province", "Shipping Phone"],
      ["#1001", "a@x", "pending", "5400", "2", "Robe", "Amina B", "12 rue Ben Mhidi", "", "Bab Ezzouar", "DZ-16", "0661223344"],
      ["#1001", "", "", "", "1", "Foulard", "", "", "", "", "", ""],
      ["#1002", "b@x", "paid", "2500", "1", "Sac", "Karim Z", "Cité 20 août", "Bt 3", "Es Senia", "31", "0770112233"],
    ];
    const recs = shopifyRecords(table)!;
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ ref: "#1001", name: "Amina B", wilaya: "16", commune: "Bab Ezzouar", cod: "5400", contents: "2 × Robe; Foulard" });
    expect(recs[1]).toMatchObject({ ref: "#1002", cod: "0", address: "Cité 20 août, Bt 3" });
    expect(shopifyRecords([["name", "phone"]])).toBeNull();
  });

  it("reads wilaya and commune from a one-column address, and paid orders collect nothing", async () => {
    const ref = await loadRef(db, merchantId);
    expect(guessPlace("Cité 5 Juillet, Bab Ezzouar, Alger", ref)).toMatchObject({ wilaya: { id: 16 }, commune: { name: "Bab Ezzouar" } });
    expect(guessPlace("Hai El Badr, Oran", ref).wilaya?.id).toBe(31);
    expect(guessPlace("nowhere special", ref).wilaya).toBeUndefined();

    // YouCan's export: one address column, a payment status, the order reference.
    const header = ["Order reference number", "Customer name", "Customer phone", "Order total", "Shipping address", "Product names and SKUs", "Payment status"];
    const { map, missing } = mapHeader(header);
    expect(missing).toEqual([]);
    expect(Object.keys(map).sort()).toEqual(["address", "cod", "contents", "name", "paid", "phone", "ref"]);
    const csv = [header, ["YC-77", "Nadia K", "0550 44 55 66", "3900", "Rue Larbi Ben Mhidi, Oran", "Montre", "Unpaid"], ["YC-78", "Omar T", "0660 11 22 33", "4200", "Bab Ezzouar, Alger", "Casque", "Paid"], ["YC-79", "X", "0660 11 22 34", "1000", "somewhere", "Y", "Unpaid"]]
      .map((r) => r.map((c) => `"${c}"`).join(","))
      .join("\n");
    const b = await stageImport(db, { merchantId, userId: merchant.userId, file: { name: "youcan.csv", bytes: Buffer.from(csv) } });
    const rows = b.rows as { values: { destWilayaId: number; codAmount: number; externalRef?: string } | null; errors: { m: string }[] }[];
    expect(rows[0].values).toMatchObject({ destWilayaId: 31, codAmount: 3900, externalRef: "YC-77" });
    expect(rows[1].values).toMatchObject({ destWilayaId: 16, codAmount: 0 });
    expect(rows[2].values).toBeNull();
    expect(rows[2].errors.map((e) => e.m)).toContain("Wilaya is missing");
  });

  it("refuses an order number already sent or repeated in the file", async () => {
    const rows = await checkRecords(db, merchantId, [
      { ref: "WC-1001", name: "Ali A", phone: "0661 00 00 01", wilaya: "16", commune: "Hydra", address: "Rue 1", cod: "100" },
      { ref: "N-1", name: "Badr B", phone: "0661 00 00 02", wilaya: "16", commune: "Hydra", address: "Rue 2", cod: "100" },
      { ref: "N-1", name: "Chafia C", phone: "0661 00 00 03", wilaya: "16", commune: "Hydra", address: "Rue 3", cod: "100" },
    ]);
    expect(rows[0].values).toBeNull();
    expect(rows[0].errors[0].m).toMatch(/already sent/);
    expect(rows[1].values?.externalRef).toBe("N-1");
    expect(rows[2].errors[0].m).toMatch(/also on line/);
  });
});

describe("scheduled pickups", () => {
  it("picks up only on the merchant's days or a booked day", async () => {
    const today = algeriaDay();
    const p = await order();
    expect((await waiting(db, "pickup")).map((w) => w.id)).toContain(p.id);
    const other = [6, 0, 1, 2, 3, 4].find((d) => d !== weekday(today))!;
    await setPickupDays(db, merchantId, [other, 5, 9]);
    const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
    expect(m.pickupDays).toBe(String(other));
    expect((await waiting(db, "pickup")).map((w) => w.id)).not.toContain(p.id);

    // Booking today (allowed before noon; the test pins the clock to 9:00 Algeria time).
    const morning = new Date(`${today}T08:00:00Z`);
    expect(bookableDays(morning)[0]).toBe(today);
    if (weekday(today) !== 5) {
      await bookPickup(db, { merchantId, userId: merchant.userId, day: today, window: "morning", expected: 4 }, morning);
      expect((await waiting(db, "pickup")).map((w) => w.id)).toContain(p.id);
    }
    await expect(bookPickup(db, { merchantId, userId: merchant.userId, day: "2020-01-01", window: "morning" })).rejects.toThrow(/working day/);
    expect(bookableDays(morning).every((d) => weekday(d) !== 5)).toBe(true);
    await setPickupDays(db, merchantId, []);
  });
});
