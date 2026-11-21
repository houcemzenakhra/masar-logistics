import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { hashPassword } from "../auth";
import type { Q } from "../db";
import { auditLog, passwordResets, rateLimits, users } from "../schema";
import { DomainError } from "./parcels";

// ---------- rate limits ----------

export type Limit = { key: string; max: number; windowSeconds: number };

/**
 * Counts one attempt against each limit and says whether all of them still allow it.
 * Fixed windows kept in Postgres, so the count holds across every server instance.
 */
export async function rateLimit(q: Q, limits: Limit[]): Promise<{ ok: boolean; retryAfter: number }> {
  let ok = true;
  let retryAfter = 0;
  for (const l of limits) {
    const window = sql`make_interval(secs => ${l.windowSeconds})`;
    const [r] = await q
      .insert(rateLimits)
      .values({ key: l.key, windowStart: new Date(), count: 1 })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${rateLimits.windowStart} < now() - ${window} then 1 else ${rateLimits.count} + 1 end`,
          windowStart: sql`case when ${rateLimits.windowStart} < now() - ${window} then now() else ${rateLimits.windowStart} end`,
        },
      })
      .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
    if (r.count > l.max) {
      ok = false;
      const left = Math.ceil((r.windowStart.getTime() + l.windowSeconds * 1000 - Date.now()) / 1000);
      retryAfter = Math.max(retryAfter, left, 1);
    }
  }
  return { ok, retryAfter };
}

/** Says whether the limits still allow an attempt, without counting one. */
export async function checkLimit(q: Q, limits: Limit[]): Promise<{ ok: boolean; retryAfter: number }> {
  let ok = true;
  let retryAfter = 0;
  for (const l of limits) {
    const [r] = await q.select().from(rateLimits).where(eq(rateLimits.key, l.key));
    if (!r) continue;
    const left = Math.ceil((r.windowStart.getTime() + l.windowSeconds * 1000 - Date.now()) / 1000);
    if (left > 0 && r.count >= l.max) {
      ok = false;
      retryAfter = Math.max(retryAfter, left);
    }
  }
  return { ok, retryAfter };
}

/** Clears a counter, e.g. failed sign-ins for an account after it signs in successfully. */
export const clearLimit = (q: Q, key: string) => q.delete(rateLimits).where(eq(rateLimits.key, key));

export const LIMITS = {
  // Sign-in limits count failed attempts only. Many phones share one address on Algerian mobile
  // networks, so the per-address limit is high; the per-account limit stops password guessing.
  loginAccount: (email: string): Limit => ({ key: `login:acct:${email.trim().toLowerCase()}`, max: 8, windowSeconds: 15 * 60 }),
  loginIp: (ip: string): Limit => ({ key: `login:ip:${ip}`, max: 100, windowSeconds: 15 * 60 }),
  signupIp: (ip: string): Limit => ({ key: `signup:ip:${ip}`, max: 10, windowSeconds: 60 * 60 }),
  resetIp: (ip: string): Limit => ({ key: `reset:ip:${ip}`, max: 6, windowSeconds: 15 * 60 }),
  resetAccount: (userId: string): Limit => ({ key: `reset:acct:${userId}`, max: 3, windowSeconds: 60 * 60 }),
  importMerchant: (merchantId: string): Limit => ({ key: `import:${merchantId}`, max: 30, windowSeconds: 60 * 60 }),
  smsTest: (userId: string): Limit => ({ key: `smstest:${userId}`, max: 5, windowSeconds: 60 * 60 }),
  // Wrong phone digits on a tracking page: per parcel, so guessing is slow wherever it comes from.
  trackVerify: (tracking: string): Limit => ({ key: `track:${tracking.toUpperCase()}`, max: 8, windowSeconds: 60 * 60 }),
};

// ---------- audit log ----------

export type Actor = { userId: string; name: string } | null;

export async function audit(
  q: Q,
  e: { actor: Actor; action: string; entity?: string; entityId?: string | null; details?: Record<string, unknown>; ip?: string | null },
) {
  await q.insert(auditLog).values({
    actorId: e.actor?.userId ?? null,
    actorName: e.actor?.name ?? "",
    action: e.action,
    entity: e.entity ?? "",
    entityId: e.entityId ?? null,
    details: e.details ?? {},
    ip: e.ip ?? null,
  });
}

export function listAudit(q: Q, f: { action?: string; limit?: number } = {}) {
  return q
    .select()
    .from(auditLog)
    .where(f.action ? eq(auditLog.action, f.action) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(f.limit ?? 200);
}

export async function auditActions(q: Q) {
  const rows = await q.selectDistinct({ action: auditLog.action }).from(auditLog).orderBy(auditLog.action);
  return rows.map((r) => r.action);
}

// ---------- password reset ----------

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const RESET_HOURS = { self: 1, admin: 24 };

/** Creates a one-time reset token. Earlier unused tokens for the account stop working. */
export async function createResetToken(q: Q, userId: string, createdBy: string | null) {
  const token = randomBytes(32).toString("base64url");
  const hours = createdBy ? RESET_HOURS.admin : RESET_HOURS.self;
  await q.transaction(async (tx) => {
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({ userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + hours * 3600_000), createdBy });
  });
  return { token, hours };
}

/** The account a token belongs to, if the token is valid and unused. */
export async function checkResetToken(q: Q, token: string) {
  const [r] = await q
    .select({ id: passwordResets.id, userId: passwordResets.userId, name: users.name, email: users.email, active: users.active })
    .from(passwordResets)
    .innerJoin(users, eq(passwordResets.userId, users.id))
    .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  return r && r.active ? r : null;
}

/** Sets the new password, uses up the token, and signs the account out everywhere. */
export async function resetPassword(q: Q, token: string, password: string) {
  if (password.length < 8) throw new DomainError("Use at least 8 characters for the password");
  return q.transaction(async (tx) => {
    const r = await checkResetToken(tx, token);
    if (!r) throw new DomainError("This link has expired or was already used. Ask for a new one.");
    // Marking it used first makes a second, simultaneous use of the same link fail.
    const used = await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResets.id, r.id), isNull(passwordResets.usedAt)))
      .returning({ id: passwordResets.id });
    if (used.length === 0) throw new DomainError("This link has expired or was already used. Ask for a new one.");
    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(password), sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, r.userId));
    return r;
  });
}

/** Signs an account out of every device. */
export const revokeSessions = (q: Q, userId: string) =>
  q.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
