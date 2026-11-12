import { desc, eq, like, sql } from "drizzle-orm";
import type { Q } from "../db";
import { ledgerLines, ledgerTxns } from "../schema";

export const acct = {
  courier: (id: string) => `courier:${id}`,
  merchant: (id: string) => `merchant:${id}`,
  companyCash: "company:cash",
  revenueDelivery: "revenue:delivery",
  revenueReturns: "revenue:returns",
};

type Line = { account: string; amount: number };
type Kind = (typeof ledgerTxns.$inferInsert)["kind"];

/** Posts one balanced transaction. Positive amounts are debits, negative are credits. */
export async function post(
  q: Q,
  t: { kind: Kind; parcelId?: string; memo?: string; createdBy?: string | null; lines: Line[] },
) {
  const lines = t.lines.filter((l) => l.amount !== 0);
  if (lines.length === 0) return null;
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (sum !== 0) throw new Error(`Unbalanced ledger transaction (${sum})`);
  if (lines.some((l) => !Number.isInteger(l.amount))) throw new Error("Ledger amounts must be whole dinars");
  const [txn] = await q
    .insert(ledgerTxns)
    .values({ kind: t.kind, parcelId: t.parcelId, memo: t.memo ?? "", createdBy: t.createdBy ?? null })
    .returning();
  await q.insert(ledgerLines).values(lines.map((l) => ({ ...l, txnId: txn.id })));
  return txn;
}

/** Debit balance of an account: the sum of its lines. */
export async function balance(q: Q, account: string): Promise<number> {
  const [r] = await q
    .select({ v: sql<number>`coalesce(sum(${ledgerLines.amount}), 0)::int` })
    .from(ledgerLines)
    .where(eq(ledgerLines.account, account));
  return r.v;
}

/** Balances of every account under a prefix, keyed by the id after the colon. */
export async function balancesByPrefix(q: Q, prefix: "courier" | "merchant" | "revenue" | "company") {
  const rows = await q
    .select({ account: ledgerLines.account, v: sql<number>`sum(${ledgerLines.amount})::int` })
    .from(ledgerLines)
    .where(like(ledgerLines.account, `${prefix}:%`))
    .groupBy(ledgerLines.account);
  return Object.fromEntries(rows.map((r) => [r.account.slice(prefix.length + 1), r.v])) as Record<string, number>;
}

/** Cash a courier is holding and has not handed over. */
export const courierCash = (q: Q, courierId: string) => balance(q, acct.courier(courierId));

/** What the company owes a merchant. Negative means the merchant owes fees. */
export const merchantOwed = async (q: Q, merchantId: string) => 0 - (await balance(q, acct.merchant(merchantId)));

export async function handover(q: Q, a: { courierId: string; amount: number; by: string }) {
  if (!Number.isInteger(a.amount) || a.amount <= 0) throw new Error("Amount must be a positive whole number");
  const held = await courierCash(q, a.courierId);
  if (a.amount > held) throw new Error(`Courier only holds ${held} DZD`);
  return post(q, {
    kind: "handover",
    memo: "Courier cash handover",
    createdBy: a.by,
    lines: [
      { account: acct.companyCash, amount: a.amount },
      { account: acct.courier(a.courierId), amount: -a.amount },
    ],
  });
}

export async function payout(q: Q, a: { merchantId: string; amount: number; by: string }) {
  if (!Number.isInteger(a.amount) || a.amount <= 0) throw new Error("Amount must be a positive whole number");
  const owed = await merchantOwed(q, a.merchantId);
  if (a.amount > owed) throw new Error(`Only ${owed} DZD is owed to this merchant`);
  const cash = await balance(q, acct.companyCash);
  if (a.amount > cash) throw new Error(`Only ${cash} DZD of collected cash is available to pay out`);
  return post(q, {
    kind: "payout",
    memo: "Merchant payout",
    createdBy: a.by,
    lines: [
      { account: acct.merchant(a.merchantId), amount: a.amount },
      { account: acct.companyCash, amount: -a.amount },
    ],
  });
}

export async function recentTxns(q: Q, opts: { account?: string; limit?: number } = {}) {
  const base = q
    .select({
      id: ledgerTxns.id,
      kind: ledgerTxns.kind,
      memo: ledgerTxns.memo,
      parcelId: ledgerTxns.parcelId,
      createdAt: ledgerTxns.createdAt,
      account: ledgerLines.account,
      amount: ledgerLines.amount,
    })
    .from(ledgerLines)
    .innerJoin(ledgerTxns, eq(ledgerLines.txnId, ledgerTxns.id));
  const filtered = opts.account ? base.where(eq(ledgerLines.account, opts.account)) : base;
  return filtered.orderBy(desc(ledgerTxns.createdAt), ledgerLines.account).limit(opts.limit ?? 100);
}
