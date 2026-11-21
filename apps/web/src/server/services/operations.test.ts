import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../auth";
import { memoryDb, type DB } from "../db";
import { chargeableKg, parseSize } from "../domain/pricing";
import { optimiseMatrix } from "../domain/route";
import { merchants, parcels, smsMessages, users } from "../schema";
import { seedReference } from "../seed";
import { byCourier, byWilaya, daily, overview } from "./analytics";
import { deliver } from "./delivery";
import { addToBag, bagReport, checkBagParcel, createBag, createManifest, addBagsToManifest, departManifest, finishBagCheck, manifestReport, receiveBag, sealBag } from "./linehaul";
import { createParcel, measureParcel, setPricingSettings, transition, type Actor, type NewParcel } from "./parcels";
import { optimiseCourierRoute, travelMatrix } from "./routes";
import { dispatch, queueParcelSms, setSmsSettings } from "./sms";
import { createZone, suggestZones, zoneFor } from "./sorting";

let db: DB;
let admin: Actor, merchant: Actor, courier: Actor, alg: Actor, orn: Actor;
let merchantId: string;
let hubId: Record<string, string>;

beforeAll(async () => {
  db = await memoryDb();
  hubId = await seedReference(db);
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
  alg = await mk("hub", "h@x", hubId.ALG);
  orn = await mk("hub", "o@x", hubId.ORN);
});

afterEach(() => vi.unstubAllEnvs());

const order = (x: Partial<NewParcel> = {}) =>
  createParcel(db, { merchantId, recipientName: "Amina", recipientPhone: "0661 22 33 44", destWilayaId: 16, communeId: 1601, address: "Rue", weightKg: 1, codAmount: 3000, ...x }, merchant);

describe("size pricing", () => {
  it("charges large light parcels by volume", async () => {
    expect(chargeableKg(2, { lengthCm: 60, widthCm: 50, heightCm: 40 })).toBe(24);
    expect(chargeableKg(2, { lengthCm: 60, widthCm: 50, heightCm: 40 }, 0)).toBe(2);
    expect(chargeableKg(3, null)).toBe(3);
    expect(parseSize("30 × 20 × 10")).toEqual({ lengthCm: 30, widthCm: 20, heightCm: 10 });
    expect(parseSize("big")).toBeNull();

    const small = await order();
    const big = await order({ lengthCm: 60, widthCm: 50, heightCm: 40 });
    expect(big.deliveryFee).toBeGreaterThan(small.deliveryFee);
    await expect(order({ lengthCm: 60 })).rejects.toThrow(/length, width and height/);
    await setPricingSettings(db, { divisor: 0 });
    expect((await order({ lengthCm: 60, widthCm: 50, heightCm: 40 })).deliveryFee).toBe(small.deliveryFee);
    await setPricingSettings(db, { divisor: 5000 });
  });

  it("lets the hub weigh and measure, and the fee follows", async () => {
    const p = await order();
    await expect(measureParcel(db, { parcelId: p.id, weightKg: 12 }, alg)).rejects.toThrow(/your hub's floor/);
    await transition(db, { parcelId: p.id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
    await transition(db, { parcelId: p.id, to: "picked_up", actor: courier });
    await transition(db, { parcelId: p.id, to: "at_origin_hub", actor: alg });
    await expect(measureParcel(db, { parcelId: p.id, weightKg: 12 }, merchant)).rejects.toThrow(/hub teams/);
    const r = await measureParcel(db, { parcelId: p.id, weightKg: 12, lengthCm: 40, widthCm: 30, heightCm: 30 }, alg);
    expect(r.after).toBeGreaterThan(r.before);
    expect(r.chargeableKg).toBe(12);
    const [after] = await db.select().from(parcels).where(eq(parcels.id, p.id));
    expect(after).toMatchObject({ weightKg: 12, lengthCm: 40, deliveryFee: r.after });
  });
});

describe("sorting lanes", () => {
  it("suggests lanes and tells the scanner where each parcel goes", async () => {
    const made = await suggestZones(db, hubId.ALG);
    expect(made.map((z) => z.code)).toEqual(expect.arrayContaining(["A", "SD", "L1"]));
    await expect(suggestZones(db, hubId.ALG)).rejects.toThrow(/already has lanes/);
    const local = await zoneFor(db, hubId.ALG, { destHubId: hubId.ALG, communeId: 1601, deliveryType: "home" });
    expect(local?.communeIds).toContain(1601);
    expect((await zoneFor(db, hubId.ALG, { destHubId: hubId.ALG, communeId: null, deliveryType: "desk" }))?.code).toBe("SD");
    expect((await zoneFor(db, hubId.ALG, { destHubId: hubId.ORN, communeId: 3101, deliveryType: "home" }))?.destHubIds).toEqual([hubId.ORN]);
    await expect(createZone(db, { hubId: hubId.ALG, code: "Z9", name: "dup", communeIds: [1601] })).rejects.toThrow(/already in lane/);
    expect(await zoneFor(db, hubId.ORN, { destHubId: hubId.ORN, communeId: 3101, deliveryType: "home" })).toBeNull();
  });
});

describe("bag checks", () => {
  it("reports parcels missing from a bag and ones that should not be there", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await order({ destWilayaId: 31, communeId: 3101 });
      await transition(db, { parcelId: p.id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
      await transition(db, { parcelId: p.id, to: "picked_up", actor: courier });
      await transition(db, { parcelId: p.id, to: "at_origin_hub", actor: alg });
      ids.push(p.id);
    }
    const bag = await createBag(db, { originHubId: hubId.ALG, destHubId: hubId.ORN }, alg);
    await addToBag(db, { bagId: bag.id, parcelIds: ids }, alg);
    await sealBag(db, bag.id, alg);
    const m = await createManifest(db, { originHubId: hubId.ALG, destHubId: hubId.ORN }, alg);
    await addBagsToManifest(db, { manifestId: m.id, bagIds: [bag.id] }, alg);
    await departManifest(db, m.id, alg);
    await expect(checkBagParcel(db, { bagId: bag.id, tracking: "MSR1" }, orn)).rejects.toThrow(/Receive bag/);
    await receiveBag(db, { id: bag.id }, orn);
    const [one, two] = await db.select().from(parcels).where(eq(parcels.bagId, bag.id)).orderBy(parcels.tracking);
    expect((await checkBagParcel(db, { bagId: bag.id, tracking: one.tracking }, orn)).result).toBe("ok");
    expect((await checkBagParcel(db, { bagId: bag.id, tracking: one.tracking }, orn)).again).toBe(true);
    expect((await checkBagParcel(db, { bagId: bag.id, tracking: two.tracking.toLowerCase() }, orn)).result).toBe("ok");
    expect((await checkBagParcel(db, { bagId: bag.id, tracking: "MSR999999999" }, orn)).result).toBe("extra");
    await expect(checkBagParcel(db, { bagId: bag.id, tracking: one.tracking }, alg)).rejects.toThrow(/staff of that hub/);
    const r = await finishBagCheck(db, bag.id, orn);
    expect(r.missing).toHaveLength(1);
    expect(r.extra.map((e) => e.tracking)).toEqual(["MSR999999999"]);
    const rep = await manifestReport(db, m.id);
    expect(rep).toMatchObject({ parcels: 3, codAtRisk: 3000 });
    expect(rep.notReceived).toHaveLength(0);
    await expect(finishBagCheck(db, bag.id, orn)).rejects.toThrow(/already checked/);
    // Marked lost by operations: no longer counted missing.
    await transition(db, { parcelId: r.missing[0].id, to: "lost", actor: admin });
    expect((await bagReport(db, bag.id)).missing).toHaveLength(0);
  });
});

describe("routes and expected times", () => {
  it("orders stops by travel time, even when times are not symmetric", () => {
    const cost = [
      [0, 10, 50, 30],
      [10, 0, 15, 40],
      [50, 15, 0, 12],
      [30, 40, 12, 0],
    ];
    expect(optimiseMatrix(cost)).toEqual({ order: [1, 2, 3], total: 37 });
  });

  it("estimates without a router, and falls back when the router fails", async () => {
    const pts = [{ lat: 36.75, lng: 3.06 }, { lat: 36.72, lng: 3.18 }];
    const est = await travelMatrix(pts);
    expect(est.source).toBe("estimate");
    expect(est.seconds[0][1]).toBeGreaterThan(60);
    vi.stubEnv("OSRM_URL", "http://127.0.0.1:9");
    expect((await travelMatrix(pts)).source).toBe("estimate");
  });

  it("gives each parcel a time at the door, in route order", async () => {
    const a = await order({ communeId: 1601 });
    const b = await order({ communeId: 1630 });
    for (const p of [a, b]) {
      await transition(db, { parcelId: p.id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
      await transition(db, { parcelId: p.id, to: "picked_up", actor: courier });
      await transition(db, { parcelId: p.id, to: "at_origin_hub", actor: alg });
      await transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
    }
    const at = new Date("2026-11-22T07:00:00Z"); // 8:00 in Algiers: the run starts at 8:30
    const r = await optimiseCourierRoute(db, courier.userId, at);
    expect(r.stops).toBeGreaterThanOrEqual(2);
    const rows = await db.select().from(parcels).where(eq(parcels.courierId, courier.userId));
    const out = rows.filter((x) => x.status === "out_for_delivery").sort((x, y) => x.routeSeq! - y.routeSeq!);
    expect(out[0].eta!.getTime()).toBeGreaterThan(new Date("2026-11-22T07:30:00Z").getTime());
    for (let i = 1; i < out.length; i++) if (out[i].eta && out[i - 1].eta) expect(out[i].eta!.getTime()).toBeGreaterThan(out[i - 1].eta!.getTime());
    await deliver(db, { parcelId: a.id, actor: courier });
  });
});

describe("WhatsApp", () => {
  it("sends by WhatsApp and falls back to a text message when WhatsApp refuses", async () => {
    await setSmsSettings(db, { enabled: { confirm_order: true, ready_at_desk: true, out_for_delivery: true, attempt_failed: true, delivered: true }, channel: "whatsapp" });
    const p = await order();
    await queueParcelSms(db, p.id, "delivered");
    vi.stubEnv("WHATSAPP_TOKEN", "t");
    vi.stubEnv("WHATSAPP_PHONE_ID", "123");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      calls.push(url);
      const body = JSON.parse(init.body);
      expect(body.template.name).toBe("masar_update");
      expect(body.to).toBe("213661223344");
      return new Response(JSON.stringify({ error: { message: "Recipient not on WhatsApp", code: 131026 } }), { status: 400 });
    });
    const r = await dispatch(db, { limit: 500 });
    vi.unstubAllGlobals();
    expect(calls[0]).toContain("graph.facebook.com/v21.0/123/messages");
    const msgs = await db.select().from(smsMessages).where(eq(smsMessages.parcelId, p.id));
    expect(msgs.map((m) => [m.channel, m.status]).sort()).toEqual([["sms", "simulated"], ["whatsapp", "failed"]]);
    expect(r.simulated).toBeGreaterThanOrEqual(1);
    await setSmsSettings(db, { enabled: { confirm_order: true, ready_at_desk: true, out_for_delivery: true, attempt_failed: true, delivered: false }, channel: "sms" });
  });
});

describe("analytics", () => {
  it("counts orders, deliveries and success by wilaya and courier", async () => {
    const o = await overview(db, 30, merchantId);
    expect(o.orders).toBeGreaterThan(5);
    expect(o.delivered).toBeGreaterThanOrEqual(1);
    expect(o.successRate).toBe(100);
    const w = await byWilaya(db, 30);
    expect(w[0].orders).toBeGreaterThanOrEqual(w[w.length - 1].orders);
    const c = await byCourier(db, 30);
    expect(c.find((x) => x.id === courier.userId)?.delivered).toBeGreaterThanOrEqual(1);
    const d = await daily(db, 7);
    expect(d).toHaveLength(7);
    expect(d[6].created).toBeGreaterThan(0);
  });
});
