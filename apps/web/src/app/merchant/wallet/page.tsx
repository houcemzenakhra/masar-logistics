import { KindBadge, memo } from "@/components/ledger-kind";
import { Card, CardHeader, PageHeader, Stat, Table, Td } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { acct, merchantOwed, recentTxns } from "@/server/services/ledger";

export default async function Wallet() {
  const s = await requireRole("merchant");
  const db = await getDb();
  const [owed, lines] = await Promise.all([merchantOwed(db, s.merchantId!), recentTxns(db, { account: acct.merchant(s.merchantId!), limit: 100 })]);
  // On the merchant's account a credit (negative) is money earned, a debit is money paid out or charged.
  const earned = lines.filter((l) => l.kind === "delivery").reduce((a, l) => a - l.amount, 0);
  const paid = lines.filter((l) => l.kind === "payout").reduce((a, l) => a + l.amount, 0);
  return (
    <>
      <PageHeader title={t("Wallet")} subtitle={t("Cash collected on your deliveries, minus fees, and what has been paid out to you.")} />
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat tone="accent" label={t("Balance owed to you")} value={money(owed)} unit={t("DZD")} />
        <Stat label={t("Earned from deliveries")} value={money(earned)} unit={t("DZD")} hint={t("In the entries below")} />
        <Stat label={t("Paid out")} value={money(paid)} unit={t("DZD")} hint={t("In the entries below")} />
      </div>
      <Card className="mt-5">
        <CardHeader title={t("Statement")} hint={t("Latest 100 entries")} />
        <Table head={["When", "Type", "Details", "Amount"]} empty={lines.length === 0}>
          {lines.map((l) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(l.createdAt)}</Td>
              <Td><KindBadge kind={l.kind} /></Td>
              <Td className="whitespace-nowrap text-ink-2">{memo(l.memo)}</Td>
              <Td className={`tnum whitespace-nowrap text-end font-medium ${l.amount < 0 ? "text-ok" : "text-ink"}`}>
                <span className="ltr">{l.amount < 0 ? "+" : "−"}{money(Math.abs(l.amount))}</span> <span className="text-xs font-normal text-muted">{t("DZD")}</span>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
