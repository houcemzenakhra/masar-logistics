import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Q } from "../db";
import { PARCEL_KINDS, renderParcelSms as renderText, renderResetSms, segments, type Lang, type ParcelKind, type ParcelVars } from "../domain/sms-text";
import { maskPhone, toE164 } from "../phone";
import { merchants, parcels, settings, smsMessages, users } from "../schema";

/**
 * Text messages to recipients and users.
 *
 * Messages are written to the `sms_messages` outbox in the same transaction as the event that
 * causes them, then sent after the response by `dispatch()`. A failed send stays in the outbox
 * and is retried. The provider is chosen with environment variables (see `provider()`).
 */

export type Kind = ParcelKind | "password_reset" | "test";
export { PARCEL_KINDS, type Lang, type ParcelKind, type ParcelVars };

// ---------- templates ----------

export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const renderParcelSms = (kind: ParcelKind, lang: Lang, v: ParcelVars) => renderText(kind, lang, v, appUrl());
export { renderResetSms, segments };

// ---------- settings ----------

export type SmsSettings = { enabled: Record<ParcelKind, boolean> };
const DEFAULTS: SmsSettings = { enabled: { out_for_delivery: true, attempt_failed: true, delivered: false } };

export async function getSmsSettings(q: Q): Promise<SmsSettings> {
  const [r] = await q.select().from(settings).where(eq(settings.key, "sms"));
  const v = (r?.value ?? {}) as Partial<SmsSettings>;
  return { enabled: { ...DEFAULTS.enabled, ...(v.enabled ?? {}) } };
}

export async function setSmsSettings(q: Q, v: SmsSettings) {
  await q
    .insert(settings)
    .values({ key: "sms", value: v })
    .onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}

// ---------- queueing ----------

/** Queues the recipient's message for a parcel event, if that kind is switched on. Call inside the event's transaction. */
export async function queueParcelSms(q: Q, parcelId: string, kind: ParcelKind) {
  const cfg = await getSmsSettings(q);
  if (!cfg.enabled[kind]) return null;
  const [p] = await q
    .select({
      id: parcels.id,
      tracking: parcels.tracking,
      phone: parcels.recipientPhone,
      lang: parcels.recipientLang,
      cod: parcels.codAmount,
      attempts: parcels.attempts,
      code: parcels.deliveryCode,
      merchant: merchants.name,
      merchantPhone: merchants.phone,
      courier: users.name,
      courierPhone: users.phone,
    })
    .from(parcels)
    .innerJoin(merchants, eq(parcels.merchantId, merchants.id))
    .leftJoin(users, eq(parcels.courierId, users.id))
    .where(eq(parcels.id, parcelId));
  if (!p) return null;
  const to = toE164(p.phone);
  if (!to) return null;
  const body = renderParcelSms(kind, p.lang, {
    tracking: p.tracking,
    merchant: p.merchant,
    merchantPhone: p.merchantPhone,
    cod: p.cod,
    courier: p.courier?.split(" ")[0],
    courierPhone: p.courierPhone ?? "",
    code: kind === "out_for_delivery" ? p.code : undefined,
  });
  // One message per parcel, kind and delivery attempt, however often the event is replayed.
  const [m] = await q
    .insert(smsMessages)
    .values({ to, body, kind, parcelId: p.id, dedupeKey: `${p.id}:${kind}:${p.attempts}` })
    .onConflictDoNothing({ target: smsMessages.dedupeKey })
    .returning();
  return m ?? null;
}

export async function queueSms(q: Q, m: { to: string; body: string; kind: Kind; userId?: string }) {
  const to = toE164(m.to);
  if (!to) return null;
  const [row] = await q.insert(smsMessages).values({ to, body: m.body, kind: m.kind, userId: m.userId }).returning();
  return row;
}

// ---------- providers ----------

type Provider = { name: string; send: (to: string, text: string) => Promise<{ id: string | null }> };

/**
 * `SMS_PROVIDER=http` sends through any gateway with an HTTP API, configured with:
 *   SMS_HTTP_URL       endpoint
 *   SMS_HTTP_METHOD    default POST
 *   SMS_HTTP_HEADERS   JSON object, e.g. {"Authorization":"Bearer …","Content-Type":"application/json"}
 *   SMS_HTTP_BODY      body template; {{to}}, {{text}} and {{from}} are replaced (JSON-escaped)
 *   SMS_HTTP_ID_PATH   optional dot path to the message id in the JSON reply, e.g. data.id
 *   SMS_FROM           sender name or number
 * Without SMS_PROVIDER, messages are recorded as `simulated` and nothing is sent.
 */
export function provider(): Provider | null {
  if (process.env.SMS_PROVIDER !== "http") return null;
  const url = process.env.SMS_HTTP_URL;
  if (!url) return null;
  return {
    name: "http",
    async send(to, text) {
      const esc = (s: string) => JSON.stringify(s).slice(1, -1);
      const body = (process.env.SMS_HTTP_BODY ?? '{"to":"{{to}}","text":"{{text}}","from":"{{from}}"}')
        .replaceAll("{{to}}", esc(to))
        .replaceAll("{{text}}", esc(text))
        .replaceAll("{{from}}", esc(process.env.SMS_FROM ?? "Masar"));
      const headers = JSON.parse(process.env.SMS_HTTP_HEADERS ?? '{"Content-Type":"application/json"}') as Record<string, string>;
      const res = await fetch(url, { method: process.env.SMS_HTTP_METHOD ?? "POST", headers, body, signal: AbortSignal.timeout(10_000) });
      const reply = await res.text();
      if (!res.ok) throw new Error(`Gateway answered ${res.status}: ${reply.slice(0, 200)}`);
      let id: string | null = null;
      if (process.env.SMS_HTTP_ID_PATH) {
        try {
          let v: unknown = JSON.parse(reply);
          for (const k of process.env.SMS_HTTP_ID_PATH.split(".")) v = (v as Record<string, unknown>)?.[k];
          id = v == null ? null : String(v);
        } catch {
          id = null;
        }
      }
      return { id };
    },
  };
}

export const MAX_SEND_ATTEMPTS = 3;

/**
 * Sends queued messages. Claims rows with `for update skip locked`, so two instances never send
 * the same message. With `retry`, failed messages under the attempt limit are sent again.
 * Messages stuck in `sending` for more than five minutes (a crashed instance) are picked up too.
 */
export async function dispatch(q: Q, opts: { limit?: number; retry?: boolean; ids?: string[] } = {}) {
  const p = provider();
  const due = or(
    eq(smsMessages.status, "queued"),
    and(eq(smsMessages.status, "sending"), lt(smsMessages.createdAt, sql`now() - interval '5 minutes'`)),
    opts.retry ? and(eq(smsMessages.status, "failed"), lt(smsMessages.attempts, MAX_SEND_ATTEMPTS)) : undefined,
  );
  const claimed = await q.transaction(async (tx) => {
    const rows = await tx
      .select({ id: smsMessages.id })
      .from(smsMessages)
      .where(opts.ids ? and(due, inArray(smsMessages.id, opts.ids)) : due)
      .orderBy(smsMessages.createdAt)
      .limit(opts.limit ?? 50)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    return tx
      .update(smsMessages)
      .set({ status: "sending", attempts: sql`${smsMessages.attempts} + 1`, provider: p?.name ?? "none" })
      .where(inArray(smsMessages.id, rows.map((r) => r.id)))
      .returning();
  });

  let sent = 0;
  let failed = 0;
  for (const m of claimed) {
    if (!p) {
      await q.update(smsMessages).set({ status: "simulated", sentAt: new Date(), error: null }).where(eq(smsMessages.id, m.id));
      continue;
    }
    try {
      const r = await p.send(m.to, m.body);
      await q.update(smsMessages).set({ status: "sent", sentAt: new Date(), providerId: r.id, error: null }).where(eq(smsMessages.id, m.id));
      sent++;
    } catch (e) {
      await q.update(smsMessages).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(smsMessages.id, m.id));
      failed++;
    }
  }
  return { claimed: claimed.length, sent, failed, simulated: p ? 0 : claimed.length };
}

// ---------- reading ----------

export function listSms(q: Q, f: { parcelId?: string; status?: string; limit?: number } = {}) {
  const where = [];
  if (f.parcelId) where.push(eq(smsMessages.parcelId, f.parcelId));
  if (f.status) where.push(eq(smsMessages.status, f.status as "sent"));
  return q
    .select({
      id: smsMessages.id,
      to: smsMessages.to,
      body: smsMessages.body,
      kind: smsMessages.kind,
      status: smsMessages.status,
      error: smsMessages.error,
      attempts: smsMessages.attempts,
      createdAt: smsMessages.createdAt,
      sentAt: smsMessages.sentAt,
      parcelId: smsMessages.parcelId,
      tracking: parcels.tracking,
    })
    .from(smsMessages)
    .leftJoin(parcels, eq(smsMessages.parcelId, parcels.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(smsMessages.createdAt))
    .limit(f.limit ?? 100);
}

export async function smsStats(q: Q, days = 7) {
  const rows = await q
    .select({ status: smsMessages.status, n: sql<number>`count(*)::int` })
    .from(smsMessages)
    .where(sql`${smsMessages.createdAt} > now() - make_interval(days => ${days})`)
    .groupBy(smsMessages.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<(typeof smsMessages.$inferSelect)["status"], number>>;
}

/** `+213550123456` → `0550 •• •• 56`. Staff see recipients' numbers masked in the outbox. */
export const displayTo = (e164: string) => maskPhone(`0${e164.slice(4, 7)} ${e164.slice(7, 9)} ${e164.slice(9, 11)} ${e164.slice(11)}`);
