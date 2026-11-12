import { Badge, Card, CardHeader, PageHeader, Stat, Table, Td } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listCouriers, listMerchants } from "@/server/services/directory";
import { acct, balance, balancesByPrefix, recentTxns } from "@/server/services/ledger";

const KIND = { delivery: ["Delivery", "success"], return_fee: ["Return fee", "warn"], handover: ["Handover", "info"], payout: ["Payout", "progress"] } as const;

export default async function Finance() {
  await requireRole("admin");
  const db = await getDb();
  const [lines, couriers, merchants, revenue, cash, cList, mList] = await Promise.all([
    recentTxns(db, { limit: 150 }),
    balancesByPrefix(db, "courier"),
    balancesByPrefix(db, "merchant"),
    balancesByPrefix(db, "revenue"),
    balance(db, acct.companyCash),
    listCouriers(db),
    listMerchants(db),
  ]);
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const names: Record<string, string> = { "company:cash": "Company cash", "revenue:delivery": "Delivery fees", "revenue:returns": "Return fees" };
  for (const c of cList) names[`courier:${c.id}`] = `Courier · ${c.name}`;
  for (const m of mList) names[`merchant:${m.id}`] = `Merchant · ${m.name}`;
  return (
    <>
      <PageHeader title="Finance" subtitle="A double-entry ledger: every dinar collected is traced from the recipient to the merchant." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Held by couriers" value={money(sum(couriers))} unit="DZD" />
        <Stat label="Company cash" value={money(cash)} unit="DZD" />
        <Stat label="Owed to merchants" value={money(-sum(merchants))} unit="DZD" />
        <Stat tone="accent" label="Fees earned" value={money(-sum(revenue))} unit="DZD" />
      </div>
      <Card className="mt-5">
        <CardHeader title="Ledger" hint="Latest entries. Debits and credits of each transaction sum to zero." />
        <Table head={["When", "Type", "Account", "Memo", "Debit", "Credit"]} empty={lines.length === 0}>
          {lines.map((l, i) => (
            <tr key={`${l.id}-${l.account}`} className={lines[i - 1]?.id === l.id ? "" : "border-t-2 border-line"}>
              <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(l.createdAt)}</Td>
              <Td><Badge tone={KIND[l.kind][1]}>{KIND[l.kind][0]}</Badge></Td>
              <Td>{names[l.account] ?? l.account}</Td>
              <Td className="text-[13px] text-muted">{l.memo}</Td>
              <Td className="tnum text-right">{l.amount > 0 ? money(l.amount) : ""}</Td>
              <Td className="tnum text-right">{l.amount < 0 ? money(-l.amount) : ""}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
