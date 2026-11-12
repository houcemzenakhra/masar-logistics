import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { acct, merchantOwed, recentTxns } from "@/server/services/ledger";

export const GET = route(async (req) => {
  const s = await auth(req, "merchant");
  const db = await getDb();
  const [balance, lines] = await Promise.all([merchantOwed(db, s.merchantId!), recentTxns(db, { account: acct.merchant(s.merchantId!), limit: 100 })]);
  // Positive amounts are money in the merchant's favour.
  return json({ balance, entries: lines.map((l) => ({ id: l.id, kind: l.kind, memo: l.memo, at: l.createdAt, amount: -l.amount })) });
});
