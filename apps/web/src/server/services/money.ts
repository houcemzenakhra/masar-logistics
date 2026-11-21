/**
 * Money beyond single deliveries: merchant payouts (requested, batched, paid), the cash check when
 * a courier hands in cash, courier pay, and monthly merchant statements. Every movement of money
 * goes through the ledger, so the books keep summing to zero.
 */
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Q } from "../db";
import { cashHandovers, courierPayRuns, hubs, ledgerLines, ledgerTxns, merchants, parcelEvents, parcels, payoutBatches, payoutRequests, settings, users } from "../schema";
import { acct, balance, courierCash, merchantOwed, post } from "./ledger";
import { admins, merchantUsers, notify } from "./notify";
import { DomainError, type Actor } from "./parcels";

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
const code = (prefix: string) => `${prefix}-${String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0")}`;

export const EXPENSE_COURIER_PAY = "expense:courier_pay";
export const EXPENSE_CASH_WRITE_OFF = "expense:cash_write_off";
export const SUSPENSE_CASH_OVER = "suspense:cash_over";

// ---------- settings ----------

export type CompanyDetails = { legalName: string; address: string; nif: string; rc: string; nis: string; ai: string; phone: string; email: string };
export type CourierPayRates = { perDelivery: number; perPickup: number; bonusThreshold: number; bonus: number };
const COMPANY: CompanyDetails = { legalName: "Masar", address: "", nif: "", rc: "", nis: "", ai: "", phone: "", email: "" };
const PAY: CourierPayRates = { perDelivery: 150, perPickup: 50, bonusThreshold: 90, bonus: 3000 };

async function getSetting<T>(q: Q, key: string, fallback: T): Promise<T> {
  const [r] = await q.select().from(settings).where(eq(settings.key, key));
  return { ...fallback, ...((r?.value ?? {}) as Partial<T>) };
}
const setSetting = (q: Q, key: string, value: unknown) =>
  q.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });

export const getCompany = (q: Q) => getSetting(q, "company", COMPANY);
export const setCompany = (q: Q, v: CompanyDetails) => setSetting(q, "company", v);
export const getPayRates = (q: Q) => getSetting(q, "courierPay", PAY);
export async function setPayRates(q: Q, v: CourierPayRates) {
  for (const [k, n] of Object.entries(v)) if (!Number.isInteger(n) || n < 0) throw new DomainError(`${k} must be a whole number, 0 or more`);
  if (v.bonusThreshold > 100) throw new DomainError("The bonus threshold is a percentage, at most 100");
  await setSetting(q, "courierPay", v);
}

// ---------- merchant payout details ----------

/** CCP: account number and 2-digit key, e.g. 0012345678 90. RIB: 20 digits. */
export function checkPayoutAccount(method: "ccp" | "bank", raw: string) {
  const d = raw.replace(/\D/g, "");
  if (method === "ccp" && !/^\d{6,10}\d{2}$/.test(d)) throw new DomainError("A CCP account is the account number followed by its 2-digit key, e.g. 0012345678 90");
  if (method === "bank" && d.length !== 20) throw new DomainError("A RIB has 20 digits");
  return method === "ccp" ? `${d.slice(0, -2)} ${d.slice(-2)}` : d.replace(/(\d{3})(\d{5})(\d{10})(\d{2})/, "$1 $2 $3 $4");
}

export async function setPayoutDetails(q: Q, merchantId: string, v: { method: "ccp" | "bank"; account: string; holder: string; legalName?: string; nif?: string; rc?: string }) {
  const holder = v.holder.trim();
  if (holder.length < 3) throw new DomainError("Enter the account holder's name as the bank knows it");
  await q
    .update(merchants)
    .set({ payoutMethod: v.method, payoutAccount: checkPayoutAccount(v.method, v.account), payoutHolder: holder.slice(0, 80), legalName: v.legalName?.trim().slice(0, 120) ?? "", nif: v.nif?.trim().slice(0, 30) ?? "", rc: v.rc?.trim().slice(0, 30) ?? "" })
    .where(eq(merchants.id, merchantId));
}

// ---------- payout requests and batches ----------

/** What a merchant can still ask for: owed, less requests not yet paid. */
export async function payoutAvailable(q: Q, merchantId: string) {
  const [owed, [{ pending }]] = await Promise.all([
    merchantOwed(q, merchantId),
    q.select({ pending: sql<number>`coalesce(sum(${payoutRequests.amount}), 0)::int` }).from(payoutRequests).where(and(eq(payoutRequests.merchantId, merchantId), inArray(payoutRequests.status, ["requested", "in_batch"]))),
  ]);
  return { owed, pending, available: Math.max(0, owed - pending) };
}

export const MIN_PAYOUT = 1000;

export async function requestPayout(db: Q, merchantId: string, amount: number, actor: Actor) {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(merchants).where(eq(merchants.id, merchantId)).for("update");
    if (!m) throw new DomainError("Merchant not found");
    if (!m.payoutMethod || !m.payoutAccount) throw new DomainError("Add your CCP or bank account first");
    const n = Math.round(amount);
    if (!(n >= MIN_PAYOUT)) throw new DomainError(`The smallest payout is ${fmt(MIN_PAYOUT)} DZD`);
    const { available } = await payoutAvailable(tx, merchantId);
    if (n > available) throw new DomainError(`You can ask for at most ${fmt(available)} DZD now`);
    const [r] = await tx
      .insert(payoutRequests)
      .values({ code: code("PO"), merchantId, amount: n, method: m.payoutMethod, account: m.payoutAccount, holder: m.payoutHolder, requestedBy: actor.userId })
      .returning();
    return r;
  });
}

export async function cancelPayout(db: Q, id: string, actor: Actor, note = "") {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(payoutRequests).where(eq(payoutRequests.id, id)).for("update");
    if (!r) throw new DomainError("Payout request not found");
    if (actor.role === "merchant" && r.merchantId !== actor.merchantId) throw new DomainError("Payout request not found");
    if (r.status !== "requested") throw new DomainError("Only a request not yet in a transfer list can be cancelled");
    const status = actor.role === "admin" ? "rejected" : "cancelled";
    if (status === "rejected" && !note.trim()) throw new DomainError("Say why the request is refused: the merchant will read it");
    await tx.update(payoutRequests).set({ status, note: note.trim().slice(0, 300) }).where(eq(payoutRequests.id, id));
  });
}

export async function listPayoutRequests(q: Q, f: { merchantId?: string | null; status?: (typeof payoutRequests.$inferSelect)["status"][]; batchId?: string } = {}) {
  return q
    .select({ request: payoutRequests, merchant: merchants.name })
    .from(payoutRequests)
    .innerJoin(merchants, eq(payoutRequests.merchantId, merchants.id))
    .where(and(f.merchantId ? eq(payoutRequests.merchantId, f.merchantId) : undefined, f.status ? inArray(payoutRequests.status, f.status) : undefined, f.batchId ? eq(payoutRequests.batchId, f.batchId) : undefined))
    .orderBy(desc(payoutRequests.createdAt))
    .limit(500)
    .then((rows) => rows.map((r) => ({ ...r.request, merchant: r.merchant })));
}

/** Gathers every open request into a transfer list. Nothing is paid yet. */
export async function createBatch(db: Q, actor: Actor) {
  return db.transaction(async (tx) => {
    const open = await tx.select().from(payoutRequests).where(eq(payoutRequests.status, "requested")).for("update");
    if (!open.length) throw new DomainError("No payout requests are waiting");
    const total = open.reduce((s, r) => s + r.amount, 0);
    const cash = await balance(tx, acct.companyCash);
    if (total > cash) throw new DomainError(`The requests add up to ${fmt(total)} DZD but only ${fmt(cash)} DZD of collected cash is available`);
    const [b] = await tx.insert(payoutBatches).values({ code: code("PB"), total, count: open.length, createdBy: actor.userId }).returning();
    await tx.update(payoutRequests).set({ status: "in_batch", batchId: b.id }).where(inArray(payoutRequests.id, open.map((r) => r.id)));
    return b;
  });
}

/**
 * Records that the bank or post office made the transfers: each request is posted to the ledger
 * and the merchant is told. Done once, with the transfer reference.
 */
export async function markBatchPaid(db: Q, batchId: string, reference: string, actor: Actor) {
  if (!reference.trim()) throw new DomainError("Enter the transfer reference from the bank or the post office");
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(payoutBatches).where(eq(payoutBatches.id, batchId)).for("update");
    if (!b) throw new DomainError("Transfer list not found");
    if (b.status === "paid") throw new DomainError("This transfer list is already marked paid");
    const items = await tx.select().from(payoutRequests).where(eq(payoutRequests.batchId, b.id));
    const now = new Date();
    for (const r of items) {
      const owed = await merchantOwed(tx, r.merchantId);
      if (r.amount > owed) throw new DomainError(`${r.code}: the merchant is now owed only ${fmt(owed)} DZD. Remove it from the list first.`);
      await post(tx, {
        kind: "payout",
        memo: `Merchant payout ${r.code}`,
        createdBy: actor.userId,
        lines: [
          { account: acct.merchant(r.merchantId), amount: r.amount },
          { account: acct.companyCash, amount: -r.amount },
        ],
      });
      await notify(tx, await merchantUsers(tx, r.merchantId), "payout_paid", { code: r.code, amount: r.amount, account: r.account }, { payoutId: r.id }, `${r.id}:paid`);
    }
    await tx.update(payoutRequests).set({ status: "paid", paidAt: now }).where(eq(payoutRequests.batchId, b.id));
    const [done] = await tx.update(payoutBatches).set({ status: "paid", paidAt: now, reference: reference.trim().slice(0, 80) }).where(eq(payoutBatches.id, b.id)).returning();
    return done;
  });
}

/** Takes one request out of an unpaid list, back to waiting. */
export async function removeFromBatch(db: Q, requestId: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(payoutRequests).where(eq(payoutRequests.id, requestId)).for("update");
    if (!r?.batchId || r.status !== "in_batch") throw new DomainError("This request is not in an unpaid transfer list");
    const [b] = await tx.select().from(payoutBatches).where(eq(payoutBatches.id, r.batchId));
    await tx.update(payoutRequests).set({ status: "requested", batchId: null }).where(eq(payoutRequests.id, r.id));
    await tx.update(payoutBatches).set({ total: b.total - r.amount, count: b.count - 1 }).where(eq(payoutBatches.id, b.id));
  });
}

export const listBatches = (q: Q) => q.select().from(payoutBatches).orderBy(desc(payoutBatches.createdAt)).limit(100);
export const getBatch = (q: Q, id: string) => q.select().from(payoutBatches).where(eq(payoutBatches.id, id)).then((r) => r[0] ?? null);

/** The transfer list as CSV, one line per transfer, for the bank or the post office. */
export async function batchCsv(q: Q, batchId: string) {
  const rows = await listPayoutRequests(q, { batchId });
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return ["reference,beneficiary,method,account,amount_dzd,merchant", ...rows.map((r) => [r.code, r.holder, r.method.toUpperCase(), r.account, r.amount, r.merchant].map(esc).join(","))].join("\r\n");
}

// ---------- cash check at the hub ----------

/**
 * Records cash a courier hands in. The count goes to company cash; a shortfall stays on the
 * courier's account (they still owe it); an excess is held aside until someone explains it.
 */
export async function receiveCash(db: Q, input: { courierId: string; counted: number; note?: string }, actor: Actor) {
  if (actor.role !== "admin" && actor.role !== "hub") throw new DomainError("Only hub teams and operations receive cash");
  const counted = Math.round(input.counted);
  if (!(counted >= 0)) throw new DomainError("Enter the amount counted");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(users).where(and(eq(users.id, input.courierId), eq(users.role, "courier"))).for("update");
    if (!c) throw new DomainError("Courier not found");
    if (actor.role === "hub" && c.hubId !== actor.hubId) throw new DomainError("This courier belongs to another hub");
    const expected = await courierCash(tx, c.id);
    if (expected <= 0 && counted === 0) throw new DomainError("This courier holds no cash");
    const difference = expected - counted;
    const take = Math.min(counted, Math.max(expected, 0));
    const over = counted - take;
    const h = { code: code("CH") };
    await post(tx, {
      kind: "handover",
      memo: `Courier cash handover ${h.code}`,
      createdBy: actor.userId,
      lines: [
        { account: acct.companyCash, amount: counted },
        { account: acct.courier(c.id), amount: -take },
        { account: SUSPENSE_CASH_OVER, amount: -over },
      ],
    });
    const [row] = await tx
      .insert(cashHandovers)
      .values({ code: h.code, courierId: c.id, hubId: actor.hubId ?? c.hubId, expected, counted, difference, note: input.note?.trim().slice(0, 300) ?? "", receivedBy: actor.userId })
      .returning();
    if (difference > 0) await notify(tx, await admins(tx), "cash_short", { courier: c.name, amount: difference, code: h.code }, { handoverId: row.id }, `${row.id}:short`);
    return row;
  });
}

/** A shortfall is settled: repaid in cash later, written off, or deducted from pay. */
export async function resolveShortfall(db: Q, handoverId: string, how: "repaid" | "written_off" | "deducted", actor: Actor) {
  if (actor.role !== "admin") throw new DomainError("Only operations can settle a shortfall");
  return db.transaction(async (tx) => {
    const [h] = await tx.select().from(cashHandovers).where(eq(cashHandovers.id, handoverId)).for("update");
    if (!h || h.difference <= 0) throw new DomainError("No shortfall to settle");
    if (h.resolution !== "none") throw new DomainError("This shortfall is already settled");
    if (how === "repaid") {
      // The courier brings the missing cash: an ordinary handover of that amount.
      await post(tx, { kind: "handover", memo: `Shortfall repaid ${h.code}`, createdBy: actor.userId, lines: [{ account: acct.companyCash, amount: h.difference }, { account: acct.courier(h.courierId), amount: -h.difference }] });
    } else if (how === "written_off") {
      await post(tx, { kind: "cash_adjustment", memo: `Shortfall written off ${h.code}`, createdBy: actor.userId, lines: [{ account: EXPENSE_CASH_WRITE_OFF, amount: h.difference }, { account: acct.courier(h.courierId), amount: -h.difference }] });
    }
    // "deducted" stays on the courier's account until the month's pay takes it.
    await tx.update(cashHandovers).set({ resolution: how }).where(eq(cashHandovers.id, h.id));
  });
}

export async function listHandovers(q: Q, f: { courierId?: string; hubId?: string | null; shortOnly?: boolean } = {}) {
  return q
    .select({ h: cashHandovers, courier: users.name, hub: hubs.name })
    .from(cashHandovers)
    .innerJoin(users, eq(cashHandovers.courierId, users.id))
    .leftJoin(hubs, eq(cashHandovers.hubId, hubs.id))
    .where(and(f.courierId ? eq(cashHandovers.courierId, f.courierId) : undefined, f.hubId ? eq(cashHandovers.hubId, f.hubId) : undefined, f.shortOnly ? and(sql`${cashHandovers.difference} > 0`, eq(cashHandovers.resolution, "none")) : undefined))
    .orderBy(desc(cashHandovers.createdAt))
    .limit(200)
    .then((r) => r.map((x) => ({ ...x.h, courier: x.courier, hub: x.hub })));
}

export async function getHandover(q: Q, id: string) {
  const [r] = await q
    .select({ h: cashHandovers, courier: users.name, courierPhone: users.phone, hub: hubs.name })
    .from(cashHandovers)
    .innerJoin(users, eq(cashHandovers.courierId, users.id))
    .leftJoin(hubs, eq(cashHandovers.hubId, hubs.id))
    .where(eq(cashHandovers.id, id));
  if (!r) return null;
  const [by] = r.h.receivedBy ? await q.select({ name: users.name }).from(users).where(eq(users.id, r.h.receivedBy)) : [];
  return { ...r.h, courier: r.courier, courierPhone: r.courierPhone, hub: r.hub, receivedByName: by?.name ?? "" };
}

/** Couriers of a hub (or all) with the cash each holds now. */
export async function couriersWithCash(q: Q, hubId?: string | null) {
  const list = await q.select({ id: users.id, name: users.name, phone: users.phone, hubId: users.hubId }).from(users).where(and(eq(users.role, "courier"), eq(users.active, true), hubId ? eq(users.hubId, hubId) : undefined)).orderBy(asc(users.name));
  return Promise.all(list.map(async (c) => ({ ...c, cash: await courierCash(q, c.id) })));
}

// ---------- courier pay ----------

export const monthBounds = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new DomainError("Month must look like 2026-11");
  const [y, m] = month.split("-").map(Number);
  // Months follow Algeria's clock (UTC+1).
  return { from: new Date(Date.UTC(y, m - 1, 1, -1)), to: new Date(Date.UTC(y, m, 1, -1)) };
};

/** The month's pay for each courier: per delivery and pickup, a bonus above the success threshold, less unsettled shortfalls marked for deduction. */
export async function paySheet(q: Q, month: string) {
  const { from, to } = monthBounds(month);
  const rates = await getPayRates(q);
  const counts = await q
    .select({ actor: parcelEvents.actorId, status: parcelEvents.status, n: sql<number>`count(*)::int` })
    .from(parcelEvents)
    .where(and(gte(parcelEvents.createdAt, from), lt(parcelEvents.createdAt, to), inArray(parcelEvents.status, ["delivered", "picked_up", "attempt_failed"])))
    .groupBy(parcelEvents.actorId, parcelEvents.status);
  const couriers = await q.select({ id: users.id, name: users.name, hub: hubs.name }).from(users).leftJoin(hubs, eq(users.hubId, hubs.id)).where(eq(users.role, "courier")).orderBy(asc(users.name));
  const deductions = await q
    .select({ courierId: cashHandovers.courierId, amount: sql<number>`sum(${cashHandovers.difference})::int` })
    .from(cashHandovers)
    .where(eq(cashHandovers.resolution, "deducted"))
    .groupBy(cashHandovers.courierId);
  const runs = await q.select().from(courierPayRuns).where(eq(courierPayRuns.month, month));
  const get = (id: string, s: string) => counts.find((c) => c.actor === id && c.status === s)?.n ?? 0;
  return couriers
    .map((c) => {
      const deliveries = get(c.id, "delivered");
      const pickups = get(c.id, "picked_up");
      const failed = get(c.id, "attempt_failed");
      const success = deliveries + failed > 0 ? Math.round((deliveries / (deliveries + failed)) * 100) : null;
      const base = deliveries * rates.perDelivery + pickups * rates.perPickup;
      const bonus = success != null && success >= rates.bonusThreshold && deliveries > 0 ? rates.bonus : 0;
      const deduct = deductions.find((d) => d.courierId === c.id)?.amount ?? 0;
      const run = runs.find((r) => r.courierId === c.id);
      return { courierId: c.id, name: c.name, hub: c.hub, deliveries, pickups, failed, success, base, bonus, deductions: run ? run.deductions : deduct, total: run ? run.total : Math.max(0, base + bonus - deduct), paid: !!run };
    })
    .filter((r) => r.deliveries + r.pickups + r.failed > 0 || r.paid);
}

/** Records the month's pay for one courier, once: pay is an expense; deducted shortfalls are cleared from what the courier owes. */
export async function recordPay(db: Q, month: string, courierId: string, actor: Actor) {
  if (actor.role !== "admin") throw new DomainError("Only operations can record pay");
  return db.transaction(async (tx) => {
    const [row] = (await paySheet(tx, month)).filter((r) => r.courierId === courierId);
    if (!row) throw new DomainError("Nothing to pay this courier for that month");
    if (row.paid) throw new DomainError("Pay for this month is already recorded");
    const gross = row.base + row.bonus;
    const deduct = row.deductions;
    if (deduct > gross) throw new DomainError(`Shortfalls to deduct (${fmt(deduct)} DZD) are more than this month's pay. Write off or have part repaid first.`);
    await post(tx, {
      kind: "courier_pay",
      memo: `Courier pay ${month}`,
      createdBy: actor.userId,
      lines: [
        { account: EXPENSE_COURIER_PAY, amount: gross },
        { account: acct.companyCash, amount: -(gross - deduct) },
        // The deducted shortfall cancels cash the courier still owed.
        { account: acct.courier(courierId), amount: -deduct },
      ],
    });
    await tx.update(cashHandovers).set({ resolution: "settled_by_pay" }).where(and(eq(cashHandovers.courierId, courierId), eq(cashHandovers.resolution, "deducted")));
    const [run] = await tx.insert(courierPayRuns).values({ month, courierId, deliveries: row.deliveries, pickups: row.pickups, bonus: row.bonus, deductions: deduct, total: gross - deduct, paidBy: actor.userId }).returning();
    return run;
  });
}

// ---------- monthly statement ----------

/**
 * A merchant's month: parcels delivered and returned, fees charged, cash collected for them,
 * claims paid and payouts made. Built from the ledger, so it always matches the wallet.
 */
export async function monthlyStatement(q: Q, merchantId: string, month: string) {
  const { from, to } = monthBounds(month);
  const [m] = await q.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!m) return null;
  const lines = await q
    .select({ kind: ledgerTxns.kind, amount: ledgerLines.amount, parcelId: ledgerTxns.parcelId })
    .from(ledgerLines)
    .innerJoin(ledgerTxns, eq(ledgerLines.txnId, ledgerTxns.id))
    .where(and(eq(ledgerLines.account, acct.merchant(merchantId)), gte(ledgerTxns.createdAt, from), lt(ledgerTxns.createdAt, to)));
  const delivered = await q
    .select({ n: sql<number>`count(*)::int`, cod: sql<number>`coalesce(sum(${parcels.codAmount}),0)::int`, fees: sql<number>`coalesce(sum(${parcels.deliveryFee}),0)::int` })
    .from(parcels)
    .where(and(eq(parcels.merchantId, merchantId), eq(parcels.status, "delivered"), gte(parcels.deliveredAt, from), lt(parcels.deliveredAt, to)));
  const sum = (k: string) => lines.filter((l) => l.kind === k).reduce((s, l) => s - l.amount, 0);
  const returnFees = -sum("return_fee");
  const returns = lines.filter((l) => l.kind === "return_fee").length;
  const company = await getCompany(q);
  const [{ opening }] = await q
    .select({ opening: sql<number>`coalesce(-sum(${ledgerLines.amount}),0)::int` })
    .from(ledgerLines)
    .innerJoin(ledgerTxns, eq(ledgerLines.txnId, ledgerTxns.id))
    .where(and(eq(ledgerLines.account, acct.merchant(merchantId)), lt(ledgerTxns.createdAt, from)));
  const movement = lines.reduce((s, l) => s - l.amount, 0);
  return {
    number: `${month.replace("-", "")}-${m.id.slice(0, 6).toUpperCase()}`,
    month,
    company,
    merchant: m,
    delivered: delivered[0].n,
    codCollected: delivered[0].cod,
    deliveryFees: delivered[0].fees,
    returns,
    returnFees,
    feesTotal: delivered[0].fees + returnFees,
    claims: sum("claim"),
    payouts: -sum("payout"),
    opening,
    closing: opening + movement,
  };
}

/** Months in which a merchant had ledger activity, newest first. */
export async function statementMonths(q: Q, merchantId: string) {
  const rows = await q
    .selectDistinct({ month: sql<string>`to_char(${ledgerTxns.createdAt} at time zone 'Africa/Algiers', 'YYYY-MM')` })
    .from(ledgerLines)
    .innerJoin(ledgerTxns, eq(ledgerLines.txnId, ledgerTxns.id))
    .where(eq(ledgerLines.account, acct.merchant(merchantId)));
  return rows.map((r) => r.month).sort().reverse();
}
