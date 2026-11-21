import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth";
import { memoryDb, type DB } from "../db";
import { checkImage } from "../images";
import { claims, courierPositions, devices, merchants, notifications, parcels, users } from "../schema";
import { seedReference } from "../seed";
import { claimable, decideClaim, fileClaim, getClaim } from "./claims";
import { deliver, listProofs, proofImage, setDeliverySettings } from "./delivery";
import { algeriaToday, assign, waiting } from "./dispatch";
import { acct, balance } from "./ledger";
import { livePositions, publicLive, recordPositions } from "./location";
import { dispatchPush, inbox, markRead, registerDevice, renderNotification } from "./notify";
import { createParcel, getParcel, transition, type Actor } from "./parcels";
import { rate, reschedule, rescheduleDays, setInstructions, verifyRecipient } from "./recipient";

// Smallest valid JPEG header and PNG header, padded: enough for the type checks.
const JPEG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]).toString("base64")}`;
const PNG = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 2)]).toString("base64")}`;

let db: DB;
let admin: Actor, hub: Actor, courier: Actor, merchant: Actor, other: Actor;

beforeAll(async () => {
  db = await memoryDb();
  const hubId = await seedReference(db);
  const [m, m2] = await db.insert(merchants).values([{ name: "Shop", phone: "0550 00 00 01", wilayaId: 16 }, { name: "Other", phone: "0550 00 00 02", wilayaId: 16 }]).returning();
  const pw = await hashPassword("x");
  const mk = async (role: Actor["role"], email: string, merchantId: string | null = null, lang: "en" | "fr" | "ar" = "fr"): Promise<Actor> => {
    const [u] = await db.insert(users).values({ name: `${email} Name`, email, role, passwordHash: pw, merchantId, hubId: hubId.ALG, lang, phone: "0770 11 22 33" }).returning();
    return { userId: u.id, role, merchantId, hubId: hubId.ALG };
  };
  admin = await mk("admin", "a@x", null, "en");
  hub = await mk("hub", "h@x");
  courier = await mk("courier", "c@x", null, "ar");
  merchant = await mk("merchant", "m@x", m.id, "fr");
  other = await mk("merchant", "o@x", m2.id);
});

const order = (codAmount = 4500) =>
  createParcel(db, { merchantId: merchant.merchantId!, recipientName: "Amina", recipientPhone: "0550 12 34 56", destWilayaId: 16, communeId: 1601, address: "Rue 1", weightKg: 1, codAmount }, merchant);

async function out(id: string) {
  await transition(db, { parcelId: id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
  await transition(db, { parcelId: id, to: "picked_up", actor: courier });
  await transition(db, { parcelId: id, to: "at_origin_hub", actor: hub });
  await transition(db, { parcelId: id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
}

describe("images", () => {
  it("accepts real JPEG and PNG and refuses anything else", () => {
    expect(checkImage(JPEG)).toMatch(/^data:image\/jpeg;base64,/);
    expect(checkImage(PNG)).toMatch(/^data:image\/png;base64,/);
    // Claims to be a JPEG but is text.
    expect(() => checkImage(`data:image/jpeg;base64,${Buffer.from("<script>").toString("base64")}`)).toThrow(/JPEG, PNG or WebP/);
    expect(() => checkImage(`data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(500 * 1024)]).toString("base64")}`)).toThrow(/too large/);
  });
});

describe("proof of delivery", () => {
  it("gives every parcel a four-digit code", async () => {
    const p = await order();
    expect(p.deliveryCode).toMatch(/^\d{4}$/);
  });

  it("refuses a wrong code and keeps the parcel out for delivery", async () => {
    const p = await order();
    await out(p.id);
    const wrong = p.deliveryCode === "0000" ? "1111" : "0000";
    await expect(deliver(db, { parcelId: p.id, actor: courier, code: wrong })).rejects.toThrow(/Wrong delivery code/);
    expect((await getParcel(db, { id: p.id }))!.status).toBe("out_for_delivery");
  });

  it("delivers with code, photo and signature in one go, and credits the merchant once", async () => {
    const p = await order();
    await out(p.id);
    const before = await balance(db, acct.merchant(merchant.merchantId!));
    const input = { parcelId: p.id, actor: courier, code: p.deliveryCode, photo: JPEG, signature: PNG, receivedBy: "Amina", lat: 36.7, lng: 3.2, idempotencyKey: "deliver-key-1" };
    await deliver(db, input);
    await deliver(db, input); // replayed from an offline phone
    const proofs = await listProofs(db, p.id);
    expect(proofs.map((x) => x.kind).sort()).toEqual(["code", "photo", "signature"]);
    expect(await proofImage(db, p.id, proofs.find((x) => x.kind === "photo")!.id)).toMatch(/^data:image\/jpeg/);
    expect(await balance(db, acct.merchant(merchant.merchantId!))).toBe(before - (4500 - p.deliveryFee));
  });

  it("can require a proof from couriers but not from operations", async () => {
    await setDeliverySettings(db, { proof: "required" });
    const [a, b] = [await order(), await order()];
    await out(a.id);
    await out(b.id);
    await expect(deliver(db, { parcelId: a.id, actor: courier })).rejects.toThrow(/Record a proof/);
    await deliver(db, { parcelId: a.id, actor: courier, photo: JPEG });
    await deliver(db, { parcelId: b.id, actor: admin });
    await setDeliverySettings(db, { proof: "optional" });
  });
});

describe("failed attempts", () => {
  it("records the reason and sends a refused parcel back at once", async () => {
    const p = await order();
    await out(p.id);
    const r = await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier, reason: "refused" });
    expect(r.status).toBe("return_initiated");
    expect(r.failReason).toBe("refused");
    const ev = (await getParcel(db, { id: p.id }))!.events;
    expect(ev.find((e) => e.status === "attempt_failed")!.note).toBe("Refused the parcel");
  });

  it("keeps the day a recipient asked for, and dispatch waits until then", async () => {
    const p = await order();
    await out(p.id);
    const day = rescheduleDays()[1];
    await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier, reason: "reschedule", preferredDate: day });
    const ids = (await waiting(db, "delivery")).map((x) => x.id);
    expect(ids).not.toContain(p.id);
    await db.update(parcels).set({ preferredDate: algeriaToday() }).where(eq(parcels.id, p.id));
    expect((await waiting(db, "delivery")).map((x) => x.id)).toContain(p.id);
  });
});

describe("notifications", () => {
  it("writes each person's message in their language, once per event", async () => {
    const p = await order();
    await out(p.id);
    await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier, reason: "absent", idempotencyKey: "fail-key-1" });
    await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier, reason: "absent", idempotencyKey: "fail-key-1" });
    const mine = await db.select().from(notifications).where(eq(notifications.userId, merchant.userId));
    const failed = mine.filter((n) => n.kind === "failed" && (n.data as { parcelId: string }).parcelId === p.id);
    expect(failed).toHaveLength(1);
    expect(failed[0].title).toBe("Échec de livraison");
    expect(failed[0].body).toContain("Destinataire absent");
    expect(renderNotification("jobs", "ar", { n: 3 }).body).toBe("أضيف 3 طرد إلى جولتك.");
  });

  it("tells a courier how many jobs were assigned", async () => {
    const a = await order();
    await assign(db, { ids: [a.id], courierId: courier.userId, mode: "pickup" }, admin);
    const { items, unread } = await inbox(db, courier.userId);
    expect(items[0].kind).toBe("jobs");
    expect(items[0].title).toBe("مهام جديدة");
    expect(unread).toBeGreaterThan(0);
    await markRead(db, courier.userId, "all");
    expect((await inbox(db, courier.userId)).unread).toBe(0);
  });

  it("pushes to registered phones, forgets uninstalled ones, and marks the rest", async () => {
    await registerDevice(db, merchant.userId, { token: "tok-good", platform: "android", lang: "fr" });
    await registerDevice(db, merchant.userId, { token: "tok-gone", platform: "android" });
    const sent: string[] = [];
    const sender = { send: async (token: string) => (token === "tok-gone" ? ("gone" as const) : (sent.push(token), "ok" as const)) };
    const r = await dispatchPush(db, sender, 500);
    expect(r.sent).toBeGreaterThan(0);
    expect(sent.every((t) => t === "tok-good")).toBe(true);
    expect((await db.select().from(devices)).map((d) => d.token)).toEqual(["tok-good"]);
    const left = await db.select().from(notifications).where(eq(notifications.push, "queued"));
    expect(left).toHaveLength(0);
    // Without Firebase settings nothing is sent but the inbox still has it.
    await transition(db, { parcelId: (await order()).id, to: "cancelled", actor: merchant });
    const p = await order();
    await out(p.id);
    await deliver(db, { parcelId: p.id, actor: courier });
    await dispatchPush(db, null);
    const [n] = await db.select().from(notifications).where(eq(notifications.dedupeKey, `${p.id}:delivered:${merchant.userId}`));
    expect(n.push).toBe("simulated");
  });
});

describe("live location", () => {
  it("keeps the newest position and ignores fixes outside Algeria or replayed late", async () => {
    const now = Date.now();
    await recordPositions(db, courier.userId, [
      { lat: 36.75, lng: 3.05, at: new Date(now - 60_000) },
      { lat: 48.85, lng: 2.35, at: new Date(now - 30_000) }, // Paris: a bad fix
    ]);
    await recordPositions(db, courier.userId, [{ lat: 36.7, lng: 3.0, at: new Date(now - 10 * 60_000) }]); // late batch
    const [pos] = await db.select().from(courierPositions).where(eq(courierPositions.courierId, courier.userId));
    expect(pos.lat).toBe(36.75);
    expect((await livePositions(db)).map((c) => c.courierId)).toContain(courier.userId);
  });

  it("shows the recipient a rounded position only while the parcel is out for delivery", async () => {
    const p = await order();
    expect(await publicLive(db, p.tracking)).toBeNull();
    await out(p.id);
    await recordPositions(db, courier.userId, [{ lat: 36.123456, lng: 3.654321, at: new Date() }]);
    const live = await publicLive(db, p.tracking);
    expect(live!.position).toEqual({ lat: 36.123, lng: 3.654, at: expect.any(Date) });
    expect(live!.courier).toBe("c@x");
  });
});

describe("claims", () => {
  it("only allows damage claims after delivery and within the window", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(claimable({ status: "in_transit", updatedAt: now, deliveredAt: null }, "damaged", now)).toMatch(/once the parcel is delivered/);
    expect(claimable({ status: "delivered", updatedAt: now, deliveredAt: new Date("2026-11-01") }, "damaged", now)).toMatch(/within 7 days/);
    expect(claimable({ status: "in_transit", updatedAt: new Date("2026-11-01"), deliveredAt: null }, "lost", now)).toBeNull();
  });

  it("files a claim with photos, refuses a second one, and pays an approved amount into the wallet", async () => {
    const p = await order(3000);
    await out(p.id);
    await deliver(db, { parcelId: p.id, actor: courier });
    await expect(fileClaim(db, { parcelId: p.id, kind: "damaged", description: "Box crushed, glass broken", amount: 2000 }, merchant)).rejects.toThrow(/at least one photo/);
    await expect(fileClaim(db, { parcelId: p.id, kind: "damaged", description: "Box crushed, glass broken", amount: 9000, photos: [JPEG] }, merchant)).rejects.toThrow(/at most|most you can claim/);
    await expect(fileClaim(db, { tracking: p.tracking, kind: "damaged", description: "Box crushed, glass broken", amount: 2000, photos: [JPEG] }, other)).rejects.toThrow(/No parcel/);
    const c = await fileClaim(db, { tracking: p.tracking, kind: "damaged", description: "Box crushed, glass broken", amount: 2000, photos: [JPEG, PNG] }, merchant);
    expect(c.code).toMatch(/^CLM-\d{6}$/);
    await expect(fileClaim(db, { parcelId: p.id, kind: "damaged", description: "Again the same box", amount: 100, photos: [JPEG] }, merchant)).rejects.toThrow(/already has claim/);
    expect((await getClaim(db, c.id))!.photoIds).toHaveLength(2);

    await expect(decideClaim(db, { claimId: c.id, approve: false }, admin)).rejects.toThrow(/Say why/);
    const before = await balance(db, acct.merchant(merchant.merchantId!));
    await decideClaim(db, { claimId: c.id, approve: true, amount: 1500, note: "Glass only" }, admin);
    expect(await balance(db, acct.merchant(merchant.merchantId!))).toBe(before - 1500);
    expect(await balance(db, "expense:claims")).toBe(1500);
    await expect(decideClaim(db, { claimId: c.id, approve: true }, admin)).rejects.toThrow(/already been decided/);
    const [row] = await db.select().from(claims).where(eq(claims.id, c.id));
    expect(row.status).toBe("approved");
  });
});

describe("recipient self-service", () => {
  it("checks the last four phone digits and slows down guessing", async () => {
    const p = await order();
    expect(await verifyRecipient(db, p.tracking, "3456")).toBe(p.id);
    for (let i = 0; i < 8; i++) await expect(verifyRecipient(db, p.tracking, "0000")).rejects.toThrow(/do not match/);
    await expect(verifyRecipient(db, p.tracking, "3456")).rejects.toThrow(/Too many wrong tries/);
  });

  it("reschedules, leaves directions for the courier, and rates once after delivery", async () => {
    const p = await order();
    await out(p.id);
    await expect(reschedule(db, p.id, algeriaToday())).rejects.toThrow(/between tomorrow/);
    await reschedule(db, p.id, rescheduleDays()[2]);
    await setInstructions(db, p.id, "Call when outside, 3rd floor");
    const view = (await getParcel(db, { id: p.id }))!;
    expect(view.preferredDate).toBe(rescheduleDays()[2]);
    expect(view.instructions).toBe("Call when outside, 3rd floor");
    const told = (await inbox(db, courier.userId)).items.filter((n) => n.kind === "recipient");
    expect(told.length).toBeGreaterThanOrEqual(2);
    await expect(rate(db, p.id, 5)).rejects.toThrow(/once you have the parcel/);
    await deliver(db, { parcelId: p.id, actor: courier });
    await rate(db, p.id, 4, "Polite courier");
    await expect(rate(db, p.id, 5)).rejects.toThrow(/already been rated/);
  });
});
