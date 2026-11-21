/**
 * Is the platform healthy? Checks that matter to money and to recipients: the ledger balances,
 * text messages go out, shops hear back, parcels do not sit forgotten, merchants get paid.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Q } from "../db";
import { ledgerLines, parcels, payoutRequests, smsMessages, webhookEndpoints } from "../schema";
import { admins, notify } from "./notify";

export type Check = { key: string; ok: boolean; value: number; label: string };

const ago = (ms: number) => new Date(Date.now() - ms);
const HOUR = 3600_000;

export async function runChecks(q: Q): Promise<{ status: "ok" | "warn"; checks: Check[]; dbMs: number }> {
  const t0 = Date.now();
  const [[ledger], [smsFailed], [smsStuck], [hooks], [stuck], [payouts]] = await Promise.all([
    q.select({ v: sql<number>`coalesce(sum(${ledgerLines.amount}), 0)::int` }).from(ledgerLines),
    q.select({ v: sql<number>`count(*)::int` }).from(smsMessages).where(and(eq(smsMessages.status, "failed"), gte(smsMessages.createdAt, ago(HOUR)))),
    q.select({ v: sql<number>`count(*)::int` }).from(smsMessages).where(and(eq(smsMessages.status, "queued"), lt(smsMessages.createdAt, ago(15 * 60_000)))),
    q.select({ v: sql<number>`count(*)::int` }).from(webhookEndpoints).where(and(eq(webhookEndpoints.active, true), gte(webhookEndpoints.failures, 5))),
    q.select({ v: sql<number>`count(*)::int` }).from(parcels).where(and(eq(parcels.status, "out_for_delivery"), lt(parcels.updatedAt, ago(48 * HOUR)))),
    q.select({ v: sql<number>`count(*)::int` }).from(payoutRequests).where(and(eq(payoutRequests.status, "requested"), lt(payoutRequests.createdAt, ago(72 * HOUR)))),
  ]);
  const dbMs = Date.now() - t0;
  const checks: Check[] = [
    // Every entry is balanced on its own, so the total is zero unless something wrote around the ledger.
    { key: "ledger", ok: ledger.v === 0, value: ledger.v, label: "Ledger balances to zero" },
    { key: "sms_failed", ok: smsFailed.v < 10, value: smsFailed.v, label: "Text messages that failed in the last hour" },
    { key: "sms_stuck", ok: smsStuck.v === 0, value: smsStuck.v, label: "Text messages waiting over 15 minutes" },
    { key: "webhooks", ok: hooks.v === 0, value: hooks.v, label: "Shop webhooks failing 5 times in a row" },
    { key: "stuck", ok: stuck.v === 0, value: stuck.v, label: "Parcels out for delivery for over 2 days" },
    { key: "payouts", ok: payouts.v === 0, value: payouts.v, label: "Payout requests waiting over 3 days" },
  ];
  return { status: checks.every((c) => c.ok) ? "ok" : "warn", checks, dbMs };
}

/** Tells operations, once a day per problem, about each failing check. */
export async function alertOnProblems(q: Q) {
  const { checks } = await runChecks(q);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(new Date());
  const people = await admins(q);
  let sent = 0;
  for (const c of checks.filter((x) => !x.ok)) {
    sent += await notify(q, people, "alert", { what: c.label, n: c.value }, { check: c.key }, `alert:${c.key}:${day}`).then(() => 1, () => 0);
  }
  return sent;
}
