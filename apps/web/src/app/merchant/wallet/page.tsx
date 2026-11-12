import { Badge, Card, CardHeader, PageHeader, Stat, Table, Td } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { acct, merchantOwed, recentTxns } from "@/server/services/ledger";

const KIND = { delivery: ["Delivery", "success"], return_fee: ["Return fee", "warn"], handover: ["Handover", "info"], payout: ["Payout", "progress"] } as const;

export default async function Wallet() {
  const s = await requireRole("merchant");
  const db = await getDb();
  const [owed, lines] = await Promise.all([merchantOwed(db, s.merchantId!), recentTxns(db, { account: acct.merchant(s.merchantId!), limit: 100 })]);
  // On the merchant's account a credit (negative) is money earned, a debit is money paid out or charged.
  const earned = lines.filter((l) => l.kind === "delivery").reduce((a, l) => a - l.amount, 0);
  const paid = lines.filter((l) => l.kind === "payout").reduce((a, l) => a + l.amount, 0);
  return (
    <>
      <PageHeader title="Wallet" subtitle="Cash collected on your deliveries, minus fees, and what has been paid out to you." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat tone="accent" label="Balance owed to you" value={money(owed)} unit="DZD" />
        <Stat label="Earned from deliveries" value={money(earned)} unit="DZD" hint="In the entries below" />
        <Stat label="Paid out" value={money(paid)} unit="DZD" hint="In the entries below" />
      </div>
      <Card className="mt-5">
        <CardHeader title="Statement" hint="Latest 100 entries" />
        <Table head={["When", "Type", "Details", "Amount"]} empty={lines.length === 0}>
          {lines.map((l) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(l.createdAt)}</Td>
              <Td><Badge tone={KIND[l.kind][1]}>{KIND[l.kind][0]}</Badge></Td>
              <Td className="text-ink-2">{l.memo}</Td>
              <Td className={`tnum text-right font-medium ${l.amount < 0 ? "text-ok" : "text-ink"}`}>
                {l.amount < 0 ? "+" : "−"}{money(Math.abs(l.amount))} <span className="text-xs font-normal text-muted">DZD</span>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
