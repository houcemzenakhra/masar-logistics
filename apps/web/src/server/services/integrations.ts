/**
 * Connecting a merchant's shop: API keys for calling Masar, and webhooks for hearing back.
 * Imports only the schema, so the parcel service can queue events without a cycle.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Q } from "../db";
import { apiKeys, merchants, users, webhookDeliveries, webhookEndpoints } from "../schema";

export class IntegrationError extends Error {}

// ---------- API keys ----------

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const KEY_PREFIX = "msr_live_";
export const MAX_KEYS = 10;

/** Makes a key. The full key is returned once and never stored. */
export async function createApiKey(q: Q, a: { merchantId: string; userId: string; name: string }) {
  const name = a.name.trim().slice(0, 60);
  if (name.length < 2) throw new IntegrationError("Name the key after where it is used, e.g. \"WooCommerce shop\"");
  const [{ n }] = await q.select({ n: sql<number>`count(*)::int` }).from(apiKeys).where(and(eq(apiKeys.merchantId, a.merchantId), isNull(apiKeys.revokedAt)));
  if (n >= MAX_KEYS) throw new IntegrationError(`At most ${MAX_KEYS} keys at a time. Revoke one you no longer use.`);
  const secret = randomBytes(24).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  const [row] = await q.insert(apiKeys).values({ merchantId: a.merchantId, name, prefix: key.slice(0, KEY_PREFIX.length + 6), hash: sha256(key), createdBy: a.userId }).returning();
  return { ...row, key };
}

export const listApiKeys = (q: Q, merchantId: string) =>
  q
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt, createdBy: users.name })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.createdBy, users.id))
    .where(eq(apiKeys.merchantId, merchantId))
    .orderBy(desc(apiKeys.createdAt));

export async function revokeApiKey(q: Q, merchantId: string, id: string) {
  const [row] = await q.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), eq(apiKeys.merchantId, merchantId), isNull(apiKeys.revokedAt))).returning();
  if (!row) throw new IntegrationError("Key not found, or already revoked");
  return row;
}

export const looksLikeApiKey = (token: string) => token.startsWith(KEY_PREFIX);

/**
 * The merchant a key acts for, as the person who made it. Null for an unknown or revoked key,
 * or when that person or the merchant account is no longer active.
 */
export async function verifyApiKey(q: Q, token: string) {
  const [row] = await q
    .select({ id: apiKeys.id, merchantId: apiKeys.merchantId, lastUsedAt: apiKeys.lastUsedAt, user: users, merchantStatus: merchants.status })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.createdBy, users.id))
    .innerJoin(merchants, eq(apiKeys.merchantId, merchants.id))
    .where(and(eq(apiKeys.hash, sha256(token)), isNull(apiKeys.revokedAt)));
  if (!row || !row.user.active || row.user.merchantId !== row.merchantId || row.merchantStatus === "suspended") return null;
  // Written at most once a minute, so a busy shop does not write on every call.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) await q.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return { userId: row.user.id, name: row.user.name, email: row.user.email, role: "merchant" as const, merchantId: row.merchantId, hubId: null, ver: row.user.sessionVersion };
}

// ---------- webhook endpoints ----------

export const WEBHOOK_EVENTS = ["parcel.created", "parcel.status_changed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const MAX_ENDPOINTS = 5;

/** Only public HTTPS addresses: no local or private networks. */
export function checkWebhookUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new IntegrationError("Enter the full address, starting with https://");
  }
  if (u.protocol !== "https:") throw new IntegrationError("The address must start with https://");
  const h = u.hostname.toLowerCase();
  const privateIp = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h === "[::1]" || h.startsWith("[fc") || h.startsWith("[fd");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || privateIp || !h.includes(".")) {
    throw new IntegrationError("Use your shop's public address, not a local or private one");
  }
  if (u.username || u.password) throw new IntegrationError("Leave passwords out of the address");
  return u.toString();
}

export async function createEndpoint(q: Q, merchantId: string, url: string) {
  const clean = checkWebhookUrl(url);
  const existing = await q.select().from(webhookEndpoints).where(eq(webhookEndpoints.merchantId, merchantId));
  if (existing.filter((e) => e.active).length >= MAX_ENDPOINTS) throw new IntegrationError(`At most ${MAX_ENDPOINTS} webhook addresses. Remove one first.`);
  if (existing.some((e) => e.active && e.url === clean)) throw new IntegrationError("This address is already set up");
  const [row] = await q.insert(webhookEndpoints).values({ merchantId, url: clean, secret: `whsec_${randomBytes(24).toString("base64url")}` }).returning();
  return row;
}

export const listEndpoints = (q: Q, merchantId: string) =>
  q.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.merchantId, merchantId), eq(webhookEndpoints.active, true))).orderBy(asc(webhookEndpoints.createdAt));

export async function removeEndpoint(q: Q, merchantId: string, id: string) {
  const [row] = await q.update(webhookEndpoints).set({ active: false }).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.merchantId, merchantId))).returning();
  if (!row) throw new IntegrationError("Webhook not found");
  // Nothing more goes to an address that was removed.
  await q.update(webhookDeliveries).set({ status: "failed", lastError: "Webhook removed" }).where(and(eq(webhookDeliveries.endpointId, id), eq(webhookDeliveries.status, "pending")));
}

export async function recentDeliveries(q: Q, merchantId: string, limit = 30) {
  return q
    .select({ id: webhookDeliveries.id, event: webhookDeliveries.event, status: webhookDeliveries.status, attempts: webhookDeliveries.attempts, responseStatus: webhookDeliveries.responseStatus, lastError: webhookDeliveries.lastError, createdAt: webhookDeliveries.createdAt, nextAttemptAt: webhookDeliveries.nextAttemptAt, url: webhookEndpoints.url, payload: webhookDeliveries.payload })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
    .where(eq(webhookEndpoints.merchantId, merchantId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

// ---------- queueing and sending ----------

/** What a parcel event carries: enough for a shop to update its order, nothing about other people. */
export function parcelEventData(p: { id: string; tracking: string; externalRef: string | null; status: string; codAmount: number; collectedAmount: number | null; deliveryFee: number; returnFee: number; failReason: string | null; deliveryType: string; kind: string; parentId: string | null; updatedAt: Date }, previousStatus?: string, note?: string) {
  return {
    parcel: {
      id: p.id,
      tracking: p.tracking,
      externalRef: p.externalRef,
      status: p.status,
      ...(previousStatus ? { previousStatus } : {}),
      codAmount: p.codAmount,
      collectedAmount: p.collectedAmount,
      deliveryFee: p.deliveryFee,
      returnFee: p.returnFee,
      failReason: p.failReason,
      deliveryType: p.deliveryType,
      kind: p.kind,
      parentId: p.parentId,
      updatedAt: p.updatedAt.toISOString(),
      ...(note ? { note } : {}),
    },
  };
}

/**
 * Queues an event for each of the merchant's webhook addresses. Call inside the transaction that
 * makes the change, so an event exists exactly when the change does.
 */
export async function queueWebhook(q: Q, merchantId: string, event: WebhookEvent, data: Record<string, unknown>, parcelId?: string) {
  const eps = await q.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(eq(webhookEndpoints.merchantId, merchantId), eq(webhookEndpoints.active, true)));
  if (eps.length === 0) return 0;
  const createdAt = new Date();
  for (const ep of eps) {
    const id = crypto.randomUUID();
    await q.insert(webhookDeliveries).values({ id, endpointId: ep.id, event, parcelId, payload: { id, event, createdAt: createdAt.toISOString(), data }, createdAt });
  }
  return eps.length;
}

/** `Masar-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the secret>`. */
export function signature(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** What a receiver does: checks the signature and that it is under five minutes old. */
export function verifySignature(secret: string, body: string, header: string, now = Date.now(), toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  const got = Buffer.from(parts.v1);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Waits before each new try: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h. Then it gives up. */
export const RETRY_DELAYS_MIN = [1, 5, 30, 120, 360, 1440];
export const MAX_WEBHOOK_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;

type Post = (url: string, init: { body: string; headers: Record<string, string> }) => Promise<{ status: number }>;
const httpPost: Post = async (url, init) => {
  const r = await fetch(url, { method: "POST", body: init.body, headers: init.headers, redirect: "manual", signal: AbortSignal.timeout(8000) });
  return { status: r.status };
};

/**
 * Sends what is due. Each delivery is claimed first (its next try pushed 5 minutes out), so two
 * servers never send the same one at once. A 2xx answer is a success; anything else is retried.
 */
export async function dispatchWebhooks(q: Q, opts: { limit?: number; post?: Post; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const post = opts.post ?? httpPost;
  const due = await q
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now)))
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(opts.limit ?? 50);
  if (due.length === 0) return { sent: 0, failed: 0 };
  const claimed = await q
    .update(webhookDeliveries)
    .set({ nextAttemptAt: new Date(now.getTime() + 5 * 60_000) })
    .where(and(inArray(webhookDeliveries.id, due.map((d) => d.id)), eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now)))
    .returning();
  let sent = 0;
  let failed = 0;
  for (const d of claimed) {
    const [ep] = await q.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, d.endpointId));
    if (!ep?.active) {
      await q.update(webhookDeliveries).set({ status: "failed", lastError: "Webhook removed" }).where(eq(webhookDeliveries.id, d.id));
      continue;
    }
    const body = JSON.stringify(d.payload);
    const attempts = d.attempts + 1;
    let status: number | null = null;
    let error: string | null = null;
    try {
      status = (await post(ep.url, { body, headers: { "content-type": "application/json", "user-agent": "Masar-Webhooks/1", "masar-event": d.event, "masar-delivery": d.id, "masar-signature": signature(ep.secret, body) } })).status;
      if (status < 200 || status >= 300) error = `HTTP ${status}`;
    } catch (e) {
      error = e instanceof Error && e.name === "TimeoutError" ? "No answer within 8 seconds" : "Could not connect to the address";
    }
    if (!error) {
      sent++;
      await q.update(webhookDeliveries).set({ status: "sent", attempts, responseStatus: status, lastError: null, sentAt: new Date() }).where(eq(webhookDeliveries.id, d.id));
      await q.update(webhookEndpoints).set({ failures: 0, lastSuccessAt: new Date() }).where(eq(webhookEndpoints.id, ep.id));
    } else {
      const giveUp = attempts >= MAX_WEBHOOK_ATTEMPTS;
      if (giveUp) failed++;
      await q
        .update(webhookDeliveries)
        .set({ status: giveUp ? "failed" : "pending", attempts, responseStatus: status, lastError: error, nextAttemptAt: new Date(now.getTime() + (RETRY_DELAYS_MIN[attempts - 1] ?? 0) * 60_000) })
        .where(eq(webhookDeliveries.id, d.id));
      await q.update(webhookEndpoints).set({ failures: ep.failures + 1, lastFailureAt: new Date() }).where(eq(webhookEndpoints.id, ep.id));
    }
  }
  return { sent, failed };
}

/** Sends one sample event now, so a merchant can check their receiver. */
export async function sendTestEvent(q: Q, merchantId: string, endpointId: string) {
  const [ep] = await q.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.merchantId, merchantId), eq(webhookEndpoints.active, true)));
  if (!ep) throw new IntegrationError("Webhook not found");
  const id = crypto.randomUUID();
  const payload = { id, event: "parcel.status_changed", test: true, createdAt: new Date().toISOString(), data: { parcel: { id: "test", tracking: "MSR000000000", externalRef: "TEST-1", status: "delivered", previousStatus: "out_for_delivery" } } };
  await q.insert(webhookDeliveries).values({ id, endpointId: ep.id, event: "parcel.status_changed", payload });
  await dispatchWebhooks(q, { limit: 50 });
  // A test is tried once: no retries.
  await q.update(webhookDeliveries).set({ status: "failed" }).where(and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.status, "pending")));
  const [d] = await q.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id));
  return d;
}
