import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword, signSession, verifySession } from "../auth";
import { memoryDb, type DB } from "../db";
import { normalizeMobile, toE164 } from "../phone";
import { merchants, parcels, smsMessages, users } from "../schema";
import { seedReference } from "../seed";
import { checkRecords, commitBatch, mapHeader, matchCommune, matchWilaya, norm, readRows, stageImport, templateCsv } from "./imports";
import { createParcel, transition, type Actor } from "./parcels";
import { LIMITS, checkLimit, checkResetToken, createResetToken, rateLimit, resetPassword } from "./security";
import { dispatch, getSmsSettings, renderParcelSms, segments, setSmsSettings } from "./sms";

let db: DB;
let admin: Actor, hub: Actor, courier: Actor, merchant: Actor, pending: Actor;
let courierRow: typeof users.$inferSelect;

beforeAll(async () => {
  db = await memoryDb();
  const hubId = await seedReference(db);
  const [m, p] = await db.insert(merchants).values([{ name: "Shop", phone: "0550 00 00 01", wilayaId: 16 }, { name: "New", phone: "0550 00 00 02", wilayaId: 16, status: "pending" }]).returning();
  const pw = await hashPassword("password-1");
  const mk = async (role: Actor["role"], email: string, merchantId: string | null = null, phone = ""): Promise<Actor> => {
    const [u] = await db.insert(users).values({ name: email, email, role, phone, passwordHash: pw, merchantId, hubId: hubId.ALG }).returning();
    if (role === "courier") courierRow = u;
    return { userId: u.id, role, merchantId, hubId: hubId.ALG };
  };
  admin = await mk("admin", "a@x");
  hub = await mk("hub", "h@x");
  courier = await mk("courier", "c@x", null, "0770 11 22 33");
  merchant = await mk("merchant", "m@x", m.id);
  pending = await mk("merchant", "p@x", p.id);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("phone numbers", () => {
  it("reads the ways people write Algerian mobiles", () => {
    for (const v of ["0550123456", "0550 12 34 56", "+213550123456", "00213 550 12 34 56", "213550123456", "550123456", 550123456, "0550-12-34-56"]) {
      expect(normalizeMobile(v)).toBe("0550 12 34 56");
    }
    expect(toE164("0661 98 76 54")).toBe("+213661987654");
    for (const v of ["021 23 45 67", "0450123456", "12345", "", "abc", null]) expect(normalizeMobile(v)).toBeNull();
  });
});

describe("sessions", () => {
  it("stop working when the password changes or the account is deactivated", async () => {
    const [u] = await db.select().from(users).where(eq(users.email, "m@x"));
    const token = await signSession({ userId: u.id, name: u.name, email: u.email, role: "merchant", merchantId: u.merchantId, hubId: null, ver: u.sessionVersion });
    expect((await verifySession(token, db))?.userId).toBe(u.id);
    const { token: reset } = await createResetToken(db, u.id, null);
    await resetPassword(db, reset, "a-new-password");
    expect(await verifySession(token, db)).toBeNull();
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    const fresh = await signSession({ userId: u.id, name: u.name, email: u.email, role: "merchant", merchantId: u.merchantId, hubId: null, ver: after.sessionVersion });
    expect(await verifySession(fresh, db)).not.toBeNull();
    await db.update(users).set({ active: false }).where(eq(users.id, u.id));
    expect(await verifySession(fresh, db)).toBeNull();
    await db.update(users).set({ active: true }).where(eq(users.id, u.id));
  });
});

describe("password reset", () => {
  it("works once, rejects reuse, short passwords and older links", async () => {
    const [u] = await db.select().from(users).where(eq(users.email, "h@x"));
    const first = await createResetToken(db, u.id, null);
    const second = await createResetToken(db, u.id, admin.userId);
    expect(second.hours).toBe(24);
    expect(await checkResetToken(db, first.token)).toBeNull();
    await expect(resetPassword(db, second.token, "short")).rejects.toThrow(/8 characters/);
    await resetPassword(db, second.token, "long-enough-1");
    await expect(resetPassword(db, second.token, "long-enough-2")).rejects.toThrow(/expired or was already used/);
    await expect(resetPassword(db, "not-a-token", "long-enough-3")).rejects.toThrow(/expired/);
  });
});

describe("rate limits", () => {
  it("blocks after the limit within the window and reports when to retry", async () => {
    const l = LIMITS.loginAccount("someone@x");
    for (let i = 0; i < l.max; i++) expect((await rateLimit(db, [l])).ok).toBe(true);
    const blocked = await rateLimit(db, [l]);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect((await rateLimit(db, [{ ...l, key: "other" }])).ok).toBe(true);
    expect((await checkLimit(db, [l])).ok).toBe(false);
    expect((await checkLimit(db, [{ ...l, key: "never-used" }])).ok).toBe(true);
  });
});

describe("text messages", () => {
  const order = (lang: "fr" | "ar" = "fr", phone = "0550 10 20 30") =>
    createParcel(db, { merchantId: merchant.merchantId!, recipientName: "R", recipientPhone: phone, recipientLang: lang, destWilayaId: 16, communeId: 1601, address: "A", weightKg: 1, codAmount: 4500 }, merchant);
  const out = async (id: string) => {
    await transition(db, { parcelId: id, to: "pickup_assigned", actor: admin, courierId: courier.userId });
    await transition(db, { parcelId: id, to: "picked_up", actor: courier });
    await transition(db, { parcelId: id, to: "at_origin_hub", actor: hub });
    await transition(db, { parcelId: id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
  };
  const msgs = (parcelId: string) => db.select().from(smsMessages).where(eq(smsMessages.parcelId, parcelId)).orderBy(smsMessages.createdAt);

  it("tells the recipient the parcel is coming, in their language, with the amount and courier", async () => {
    const p = await order("ar");
    await out(p.id);
    const [m] = await msgs(p.id);
    expect(m.kind).toBe("out_for_delivery");
    expect(m.to).toBe("+213550102030");
    expect(m.body).toContain("4,500 دج");
    expect(m.body).toContain(courierRow.phone);
    expect(m.body).toContain(`/t/${p.tracking}`);
  });

  it("sends one message per attempt, none when the parcel goes back, and respects the switches", async () => {
    const p = await order();
    await out(p.id);
    await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier });
    await transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
    await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier });
    await transition(db, { parcelId: p.id, to: "out_for_delivery", actor: admin, courierId: courier.userId });
    const third = await transition(db, { parcelId: p.id, to: "attempt_failed", actor: courier });
    expect(third.status).toBe("return_initiated");
    expect((await msgs(p.id)).map((m) => m.kind)).toEqual(["out_for_delivery", "attempt_failed", "out_for_delivery", "attempt_failed", "out_for_delivery"]);

    await setSmsSettings(db, { enabled: { out_for_delivery: false, attempt_failed: true, delivered: true } });
    const q = await order();
    await out(q.id);
    await transition(db, { parcelId: q.id, to: "delivered", actor: courier });
    expect((await msgs(q.id)).map((m) => m.kind)).toEqual(["delivered"]);
    await setSmsSettings(db, (await getSmsSettings(db)) && { enabled: { out_for_delivery: true, attempt_failed: true, delivered: false } });
  });

  it("keeps French messages in one GSM part and counts Arabic parts", () => {
    const v = { tracking: "MSR123456789", merchant: "Dar El Moda", merchantPhone: "0550 12 34 56", cod: 12500, courier: "Riad", courierPhone: "0770 11 22 33" };
    const fr = segments(renderParcelSms("out_for_delivery", "fr", v));
    expect(fr.encoding).toBe("GSM-7");
    expect(fr.parts).toBeLessThanOrEqual(2);
    expect(segments(renderParcelSms("out_for_delivery", "ar", v)).encoding).toBe("UCS-2");
    expect(segments("x".repeat(160)).parts).toBe(1);
    expect(segments("x".repeat(161)).parts).toBe(2);
  });

  it("records messages as simulated without a provider, and sends and retries through an HTTP gateway", async () => {
    await db.update(smsMessages).set({ status: "simulated" });
    const p = await order();
    await out(p.id);
    expect((await dispatch(db)).simulated).toBe(1);
    expect((await msgs(p.id))[0].status).toBe("simulated");

    vi.stubEnv("SMS_PROVIDER", "http");
    vi.stubEnv("SMS_HTTP_URL", "https://gateway.example/send");
    vi.stubEnv("SMS_HTTP_ID_PATH", "data.id");
    const calls: { body: string }[] = [];
    let fail = true;
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      calls.push({ body: init.body });
      return fail ? new Response("busy", { status: 503 }) : new Response(JSON.stringify({ data: { id: "gw-1" } }), { status: 200 });
    });
    const q = await order();
    await out(q.id);
    expect((await dispatch(db)).failed).toBe(1);
    expect(JSON.parse(calls[0].body).to).toBe("+213550102030");
    expect((await msgs(q.id))[0].error).toMatch(/503/);
    expect((await dispatch(db)).claimed).toBe(0);
    fail = false;
    expect((await dispatch(db, { retry: true })).sent).toBe(1);
    const [m] = await msgs(q.id);
    expect(m).toMatchObject({ status: "sent", providerId: "gw-1", attempts: 2 });
  });
});

describe("bulk import", () => {
  it("recognises column titles in three languages and reads CSV with semicolons", async () => {
    expect(mapHeader(["Nom", "Téléphone", "Wilaya", "Commune", "Adresse", "Montant", "Poids"]).missing).toEqual([]);
    expect(mapHeader(["الاسم", "الهاتف", "الولاية", "البلدية", "العنوان", "المبلغ"]).missing).toEqual([]);
    expect(mapHeader(["Name", "Phone"]).missing).toEqual(["wilaya", "commune", "address", "cod"]);
    const rows = await readRows({ name: "o.csv", bytes: Buffer.from("﻿Nom;Téléphone\nAmine;0550 12 34 56\n") });
    expect(rows).toEqual([["Nom", "Téléphone"], ["Amine", "0550 12 34 56"]]);
    expect((await readRows({ name: "t.csv", bytes: Buffer.from(templateCsv("fr")) })).length).toBe(3);
  });

  it("matches wilayas by code or name and communes despite accents and typos", async () => {
    const { wilayas, communes } = await import("../schema");
    const ws = await db.select().from(wilayas);
    const cs = await db.select().from(communes);
    expect(matchWilaya("16", ws)?.id).toBe(16);
    expect(matchWilaya("09", ws)?.id).toBe(9);
    expect(matchWilaya("16 - Alger", ws)?.id).toBe(16);
    expect(matchWilaya("Algiers", ws)?.id).toBe(16);
    expect(matchWilaya("BEJAIA", ws)?.id).toBe(6);
    expect(matchWilaya("وهران", ws)?.id).toBe(31);
    expect(matchWilaya("Atlantis", ws)).toBeNull();
    const alger = cs.filter((c) => c.wilayaId === 16);
    expect(matchCommune("bab ezzouar", alger).commune?.name).toBe("Bab Ezzouar");
    expect(matchCommune("Bab Ezouar", alger)).toMatchObject({ corrected: true });
    expect(matchCommune("Bab Ezouar", alger).commune?.name).toBe("Bab Ezzouar");
    expect(matchCommune("Nowhere Town", alger).commune).toBeNull();
    expect(norm("Aïn Témouchent")).toBe("ain temouchent");
  });

  it("checks every row, explains problems, and creates only valid rows on confirm", async () => {
    const csv = [
      "Name,Phone,Wilaya,Commune,Address,COD,Weight,Contents,SMS language",
      "Amine,550123456,16,Bab Ezouar,Cité 5 Juillet,4500,1,Shoes,ar",
      "Lina,0661 98 76 54,Oran,Bir El Djir,Rue 3,3 200,2.5,,",
      "Bad,021 00 00 00,99,X,,abc,,,",
      "Karim,0661 98 76 54,Oran,Bir El Djir,Rue 3,3200,1,,",
    ].join("\n");
    const b = await stageImport(db, { merchantId: merchant.merchantId!, userId: merchant.userId, file: { name: "orders.csv", bytes: Buffer.from(csv) } });
    expect(b).toMatchObject({ validCount: 3, invalidCount: 1, status: "draft" });
    const rows = b.rows as Awaited<ReturnType<typeof checkRecords>>;
    expect(rows[0].values).toMatchObject({ recipientPhone: "0550 12 34 56", destWilayaId: 16, recipientLang: "ar", codAmount: 4500 });
    expect(rows[0].warnings[0].m).toMatch(/read as/);
    expect(rows[1].values).toMatchObject({ codAmount: 3200, weightKg: 3 });
    expect(rows[2].errors.map((e) => e.m)).toEqual([
      "“{x}” is not an Algerian mobile number",
      "Unknown wilaya “{x}”. Use its code (1 to 69) or its name.",
      "Address is missing or too short",
      "“{x}” is not an amount",
    ]);
    expect(rows[3].warnings.map((w) => w.m)).toContain("Same phone and amount as line {n}");
    expect(await commitBatch(db, b.id, merchant)).toBe(3);
    await expect(commitBatch(db, b.id, merchant)).rejects.toThrow(/already created/);
    const made = await db.select().from(parcels).where(eq(parcels.importId, b.id));
    expect(made).toHaveLength(3);
    expect(made.find((p) => p.recipientName === "Amine")?.recipientLang).toBe("ar");
  });

  it("refuses pending merchants, files without the required columns and other merchants' batches", async () => {
    const file = { name: "o.csv", bytes: Buffer.from("Name,Phone,Wilaya,Commune,Address,COD\nA,0550123456,16,Hydra,Rue 1,100") };
    await expect(stageImport(db, { merchantId: pending.merchantId!, userId: pending.userId, file })).rejects.toThrow(/waiting for approval/);
    await expect(stageImport(db, { merchantId: merchant.merchantId!, userId: merchant.userId, file: { name: "o.csv", bytes: Buffer.from("Foo,Bar\n1,2") } })).rejects.toThrow(/Missing columns/);
    await expect(stageImport(db, { merchantId: merchant.merchantId!, userId: merchant.userId, file: { name: "o.pdf", bytes: Buffer.from("x") } })).rejects.toThrow(/csv or .xlsx/);
    const b = await stageImport(db, { merchantId: merchant.merchantId!, userId: merchant.userId, file });
    await expect(commitBatch(db, b.id, pending)).rejects.toThrow(/not found/);
  });
});
