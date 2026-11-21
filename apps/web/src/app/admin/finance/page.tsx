import { FinanceNav } from "@/components/finance-nav";
import { KindBadge, memo } from "@/components/ledger-kind";
import { Card, CardHeader, PageHeader, Stat, Table, Td } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listCouriers, listMerchants } from "@/server/services/directory";
import { acct, balance, balancesByPrefix, recentTxns } from "@/server/services/ledger";

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
  const names: Record<string, string> = {
    "company:cash": t("Company cash"),
    "revenue:delivery": t("Delivery fees"),
    "revenue:returns": t("Return fees"),
    "expense:claims": t("Claims paid"),
    "expense:courier_pay": t("Courier pay"),
    "expense:cash_write_off": t("Cash written off"),
    "suspense:cash_over": t("Unexplained extra cash"),
  };
  for (const c of cList) names[`courier:${c.id}`] = `${t("Courier")} · ${c.name}`;
  for (const m of mList) names[`merchant:${m.id}`] = `${t("Merchant")} · ${m.name}`;
  return (
    <>
      <PageHeader title={t("Finance")} subtitle={t("A double-entry ledger: every dinar collected is traced from the recipient to the merchant.")} />
      <FinanceNav here="/admin/finance" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t("Held by couriers")} value={money(sum(couriers))} unit={t("DZD")} />
        <Stat label={t("Company cash")} value={money(cash)} unit={t("DZD")} />
        <Stat label={t("Owed to merchants")} value={money(-sum(merchants))} unit={t("DZD")} />
        <Stat tone="accent" label={t("Fees earned")} value={money(-sum(revenue))} unit={t("DZD")} />
      </div>
      <Card className="mt-5">
        <CardHeader title={t("Ledger")} hint={t("Latest entries. Debits and credits of each transaction sum to zero.")} />
        <Table head={["When", "Type", "Account", "Details", "Debit", "Credit"]} empty={lines.length === 0}>
          {lines.map((l, i) => (
            <tr key={`${l.id}-${l.account}`} className={lines[i - 1]?.id === l.id ? "" : "border-t-2 border-line"}>
              <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(l.createdAt)}</Td>
              <Td><KindBadge kind={l.kind} /></Td>
              <Td className="whitespace-nowrap">{names[l.account] ?? l.account}</Td>
              <Td className="whitespace-nowrap text-[13px] text-muted">{memo(l.memo)}</Td>
              <Td className="tnum text-end">{l.amount > 0 ? money(l.amount) : ""}</Td>
              <Td className="tnum text-end">{l.amount < 0 ? money(-l.amount) : ""}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
