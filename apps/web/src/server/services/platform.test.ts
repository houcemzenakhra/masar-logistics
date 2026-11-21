import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { areaOf, canUse } from "../../lib/staff";
import { hashPassword } from "../auth";
import { memoryDb, type DB } from "../db";
import { ledgerLines, users } from "../schema";
import { seed } from "../seed";
import { base32Decode, base32Encode, codeAt, decryptSecret, encryptSecret, matchCode, stepAt } from "../totp";
import { brandSms, contrastWithWhite, getBrand, setBrand } from "./brand";
import { runChecks } from "./health";
import { checkSecondFactor, confirmEnrollment, disableTwoStep, resetTwoStep, startEnrollment } from "./twostep";

let db: DB;
let userId: string;

beforeAll(async () => {
  db = await memoryDb();
  const [u] = await db.insert(users).values({ name: "Ops", email: "ops@x.dz", role: "admin", passwordHash: await hashPassword("x") }).returning();
  userId = u.id;
});

describe("authenticator codes", () => {
  it("matches the RFC 6238 test vector", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    // RFC 6238, SHA-1, T = 59 s gives 94287082 (8 digits); 6 digits are the last six.
    expect(codeAt(secret, stepAt(59_000))).toBe("287082");
    expect(codeAt(secret, stepAt(1111111109_000))).toBe("081804");
  });

  it("accepts a step of drift, refuses older codes and reuse", () => {
    const s = base32Encode(Buffer.from("abcdefghijabcdefghij"));
    const now = 1_800_000_000_000;
    const step = stepAt(now);
    expect(matchCode(s, codeAt(s, step), null, now)).toBe(step);
    expect(matchCode(s, codeAt(s, step - 1), null, now)).toBe(step - 1);
    expect(matchCode(s, codeAt(s, step - 3), null, now)).toBeNull();
    expect(matchCode(s, codeAt(s, step), step, now)).toBeNull();
    expect(matchCode(s, "12345", null, now)).toBeNull();
  });

  it("keeps the secret encrypted at rest", () => {
    const enc = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(enc).not.toContain("JBSWY3DP");
    expect(decryptSecret(enc)).toBe("JBSWY3DPEHPK3PXP");
    const [v, iv, body, tag] = enc.split(".");
    expect(() => decryptSecret([v, iv, body.slice(0, -2) + "AA", tag].join("."))).toThrow();
  });
});

describe("two-step sign-in", () => {
  it("enrols with a first code, accepts each code once, and spends recovery codes", async () => {
    const { secret, url } = await startEnrollment(db, userId, "Masar");
    expect(url).toMatch(/^otpauth:\/\/totp\/Masar%3Aops%40x\.dz\?secret=[A-Z2-7]+&issuer=Masar/);
    await expect(confirmEnrollment(db, userId, "000000")).rejects.toThrow(/not right/);
    const [before] = await db.select().from(users).where(eq(users.id, userId));
    const codes = await confirmEnrollment(db, userId, codeAt(secret, stepAt()));
    expect(codes).toHaveLength(10);
    const [after] = await db.select().from(users).where(eq(users.id, userId));
    expect(after.totpEnabledAt).not.toBeNull();
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect(after.recoveryCodes).not.toContain(codes[0]);

    // The enrolment code was the current step: the same code cannot sign in.
    expect(await checkSecondFactor(db, userId, codeAt(secret, stepAt()))).toBe(false);
    expect(await checkSecondFactor(db, userId, codeAt(secret, stepAt() + 1))).toBe(true);
    expect(await checkSecondFactor(db, userId, codes[0])).toBe(true);
    expect(await checkSecondFactor(db, userId, codes[0])).toBe(false);
    expect(await checkSecondFactor(db, userId, codes[1].toUpperCase())).toBe(true);

    await expect(startEnrollment(db, userId, "Masar")).rejects.toThrow(/already on/);
    await expect(disableTwoStep(db, userId, "nope-nope")).rejects.toThrow(/not right/);
    await disableTwoStep(db, userId, codes[2]);
    expect(await checkSecondFactor(db, userId, codes[3])).toBe(false);
  });

  it("can be reset by operations", async () => {
    const { secret } = await startEnrollment(db, userId, "Masar");
    await confirmEnrollment(db, userId, codeAt(secret, stepAt()));
    await resetTwoStep(db, userId);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u).toMatchObject({ totpEnabledAt: null, totpSecret: null, recoveryCodes: [] });
  });
});

describe("staff roles", () => {
  it("limits each role to its areas", () => {
    expect(areaOf("/admin")).toBe("overview");
    expect(areaOf("/admin/finance/payouts/x")).toBe("finance");
    expect(areaOf("/admin/sorting")).toBe("dispatch");
    expect(areaOf("/admin/team")).toBe("settings");
    expect(canUse("owner", "settings")).toBe(true);
    expect(canUse("finance", "finance")).toBe(true);
    expect(canUse("finance", "dispatch")).toBe(false);
    expect(canUse("dispatch", "finance")).toBe(false);
    expect(canUse("support", "claims")).toBe(true);
    expect(canUse("support", "settings")).toBe(false);
    expect(canUse(undefined, "settings")).toBe(true);
  });
});

describe("brand", () => {
  it("checks the colour stays readable and renames text messages", async () => {
    expect(contrastWithWhite("#ff5b24")).toBeGreaterThan(2.8);
    await expect(setBrand(db, { name: "Yalidine Plus", accent: "#ffee88", supportPhone: "", supportEmail: "" })).rejects.toThrow(/too light/);
    await expect(setBrand(db, { name: "X", accent: "#123456", supportPhone: "", supportEmail: "" })).rejects.toThrow(/2 to 30/);
    await setBrand(db, { name: "Sahel Express", accent: "#1F5FAD", supportPhone: "023 45 67 89", supportEmail: "aide@sahel.dz" });
    const b = await getBrand(db);
    expect(b).toMatchObject({ name: "Sahel Express", accent: "#1f5fad" });
    expect(brandSms("Masar: votre colis arrive", b)).toBe("Sahel Express: votre colis arrive");
    expect(brandSms("مسار: طردك في الطريق", b)).toBe("Sahel Express: طردك في الطريق");
  });
});

describe("health", () => {
  it("is fine on the demo, and catches a ledger that does not balance", async () => {
    const d = await memoryDb();
    await seed(d, "masar-demo");
    const ok = await runChecks(d);
    expect(ok.checks.find((c) => c.key === "ledger")?.ok).toBe(true);
    await d.insert(ledgerLines).values({ txnId: (await d.select().from(ledgerLines).limit(1))[0].txnId, account: "company:cash", amount: 5 });
    const bad = await runChecks(d);
    expect(bad.status).toBe("warn");
    expect(bad.checks.find((c) => c.key === "ledger")).toMatchObject({ ok: false, value: 5 });
  });
});
