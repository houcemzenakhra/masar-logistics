import Link from "next/link";
import { payRatesAction, recordPayAction } from "@/app/actions";
import { FinanceNav } from "@/components/finance-nav";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, CardHeader, Field, Input, Money, PageHeader, Table, Td } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { getPayRates, paySheet } from "@/server/services/money";

export const metadata = { title: "Courier pay" };

function months(n = 6) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export default async function Pay({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireStaff("finance");
  const list = months();
  const asked = (await searchParams).month;
  const month = asked && list.includes(asked) ? asked : list[0];
  const db = await getDb();
  const [rows, rates] = await Promise.all([paySheet(db, month), getPayRates(db)]);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <>
      <PageHeader title={t("Finance")} subtitle={t("Pay per delivery and per pickup, a bonus above a success rate, less shortfalls marked to take from pay.")} />
      <FinanceNav here="/admin/finance/pay" />
      <nav className="mb-4 flex flex-wrap gap-1" aria-label={t("Month")}>
        {list.map((m) => (
          <Link key={m} href={`/admin/finance/pay?month=${m}`} aria-current={m === month ? "page" : undefined} className={`rounded-lg px-3 py-1 text-sm tnum ${m === month ? "bg-surface font-medium shadow-card" : "text-muted hover:text-ink"}`}>{m}</Link>
        ))}
      </nav>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader title={t("Pay for {m}", { m: month })} hint={t("Total {x} DZD", { x: new Intl.NumberFormat("en-US").format(total) })} />
          <Table head={["Courier", "Delivered", "Picked up", "Success", "Base", "Bonus", "Deducted", "To pay", ""]} empty={rows.length === 0}>
            {rows.map((r) => (
              <tr key={r.courierId}>
                <Td><span className="font-medium">{r.name}</span><span className="block text-[13px] text-muted">{r.hub ? t(r.hub) : ""}</span></Td>
                <Td className="tnum">{r.deliveries}</Td>
                <Td className="tnum">{r.pickups}</Td>
                <Td className="tnum">{r.success == null ? "—" : `${r.success}%`}</Td>
                <Td><Money value={r.base} /></Td>
                <Td><Money value={r.bonus} /></Td>
                <Td className={r.deductions ? "text-danger" : ""}><Money value={r.deductions} /></Td>
                <Td className="font-semibold"><Money value={r.total} /></Td>
                <Td className="text-end">
                  {r.paid ? (
                    <Badge tone="success">{t("Recorded")}</Badge>
                  ) : (
                    <ActionForm action={recordPayAction}>
                      <input type="hidden" name="month" value={month} />
                      <input type="hidden" name="courierId" value={r.courierId} />
                      <Submit size="sm" variant="ghost">{t("Record as paid")}</Submit>
                    </ActionForm>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardHeader title={t("Rates")} />
          <ActionForm action={payRatesAction} className="space-y-3 p-5">
            <Field label={t("Per delivery (DZD)")}><Input name="perDelivery" type="number" min={0} defaultValue={rates.perDelivery} /></Field>
            <Field label={t("Per pickup (DZD)")}><Input name="perPickup" type="number" min={0} defaultValue={rates.perPickup} /></Field>
            <Field label={t("Bonus (DZD)")}><Input name="bonus" type="number" min={0} defaultValue={rates.bonus} /></Field>
            <Field label={t("Bonus from a success rate of (%)")}><Input name="bonusThreshold" type="number" min={0} max={100} defaultValue={rates.bonusThreshold} /></Field>
            <Submit>{t("Save")}</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
