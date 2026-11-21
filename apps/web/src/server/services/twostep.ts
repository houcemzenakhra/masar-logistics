/** Two-step sign-in with an authenticator app, and the rule that staff must use it. */
import { eq } from "drizzle-orm";
import type { Q } from "../db";
import { settings, users } from "../schema";
import { decryptSecret, encryptSecret, hashRecovery, matchCode, newRecoveryCodes, newSecret, otpauthUrl } from "../totp";

export class SecurityError extends Error {}

export type SecurityPolicy = { /** Operations and hub staff must turn on two-step sign-in. */ requireStaff2fa: boolean };

export async function getSecurityPolicy(q: Q): Promise<SecurityPolicy> {
  const [r] = await q.select().from(settings).where(eq(settings.key, "security"));
  return { requireStaff2fa: false, ...((r?.value ?? {}) as Partial<SecurityPolicy>) };
}

export async function setSecurityPolicy(q: Q, v: SecurityPolicy) {
  await q.insert(settings).values({ key: "security", value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}

async function user(q: Q, userId: string) {
  const [u] = await q.select().from(users).where(eq(users.id, userId));
  if (!u) throw new SecurityError("Account not found");
  return u;
}

/** A new secret to scan. Replaces any unfinished one; refused while two-step sign-in is on. */
export async function startEnrollment(q: Q, userId: string, issuer: string) {
  const u = await user(q, userId);
  if (u.totpEnabledAt) throw new SecurityError("Two-step sign-in is already on");
  const secret = newSecret();
  await q.update(users).set({ totpSecret: encryptSecret(secret), totpLastStep: null }).where(eq(users.id, userId));
  return { secret, url: otpauthUrl(secret, u.email, issuer) };
}

/** Turns two-step sign-in on with a first code from the app. Returns the recovery codes, shown once. */
export async function confirmEnrollment(q: Q, userId: string, code: string) {
  const u = await user(q, userId);
  if (u.totpEnabledAt) throw new SecurityError("Two-step sign-in is already on");
  if (!u.totpSecret) throw new SecurityError("Start again: scan the code first");
  const step = matchCode(decryptSecret(u.totpSecret), code, null);
  if (step === null) throw new SecurityError("That code is not right. Check the time on your phone and try the newest code.");
  const codes = newRecoveryCodes();
  // A new session version signs out other devices, which signed in with one step only.
  await q.update(users).set({ totpEnabledAt: new Date(), totpLastStep: step, recoveryCodes: codes.map(hashRecovery), sessionVersion: u.sessionVersion + 1 }).where(eq(users.id, userId));
  return codes;
}

/**
 * Checks a code from the app, or one of the recovery codes (which is then used up). True when
 * accepted. An account without two-step sign-in has nothing to check and is refused.
 */
export async function checkSecondFactor(q: Q, userId: string, code: string) {
  const u = await user(q, userId);
  if (!u.totpEnabledAt || !u.totpSecret) return false;
  const c = code.trim();
  if (/^\d{3}\s?\d{3}$/.test(c)) {
    const step = matchCode(decryptSecret(u.totpSecret), c, u.totpLastStep);
    if (step === null) return false;
    await q.update(users).set({ totpLastStep: step }).where(eq(users.id, userId));
    return true;
  }
  const h = hashRecovery(c);
  if (!u.recoveryCodes.includes(h)) return false;
  await q.update(users).set({ recoveryCodes: u.recoveryCodes.filter((x) => x !== h) }).where(eq(users.id, userId));
  return true;
}

export async function disableTwoStep(q: Q, userId: string, code: string) {
  if (!(await checkSecondFactor(q, userId, code))) throw new SecurityError("That code is not right");
  await q.update(users).set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] }).where(eq(users.id, userId));
}

/** Operations can switch it off for someone who lost their phone and their recovery codes. */
export async function resetTwoStep(q: Q, userId: string) {
  const u = await user(q, userId);
  await q.update(users).set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [], sessionVersion: u.sessionVersion + 1 }).where(eq(users.id, userId));
}

export async function newRecoveryCodesFor(q: Q, userId: string, code: string) {
  if (!(await checkSecondFactor(q, userId, code))) throw new SecurityError("That code is not right");
  const codes = newRecoveryCodes();
  await q.update(users).set({ recoveryCodes: codes.map(hashRecovery) }).where(eq(users.id, userId));
  return codes;
}
