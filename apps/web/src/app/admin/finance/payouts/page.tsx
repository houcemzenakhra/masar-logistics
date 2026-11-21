import Link from "next/link";
import { cancelPayoutAction, createBatchAction } from "@/app/actions";
import { FinanceNav } from "@/components/finance-nav";
import { ActionForm, Submit } from "@/components/forms";
import { PayoutTable } from "@/components/payouts";
import { Badge, Card, CardHeader, Input, Money, Mono, PageHeader, Table, Td } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { acct, balance } from "@/server/services/ledger";
import { listBatches, listPayoutRequests } from "@/server/services/money";

export const metadata = { title: "Payouts" };

export default async function Payouts() {
  await requireStaff("finance");
  const db = await getDb();
  const [waiting, batches, cash] = await Promise.all([listPayoutRequests(db, { status: ["requested"] }), listBatches(db), balance(db, acct.companyCash)]);
  const total = waiting.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <PageHeader title={t("Finance")} subtitle={t("Merchants ask to be paid; you send the transfers in a list, then mark the list paid with the bank's reference.")} />
      <FinanceNav here="/admin/finance/payouts" />
      <Card>
        <CardHeader
          title={t("Waiting requests")}
          hint={t("Requests: {n}, {x} DZD in all. Company cash: {c} DZD.", { n: waiting.length, x: money(total), c: money(cash) })}
          action={
            waiting.length > 0 && (
              <ActionForm action={createBatchAction}>
                <Submit size="sm">{t("Make a transfer list")}</Submit>
              </ActionForm>
            )
          }
        />
        <PayoutTable
          rows={waiting}
          merchant
          actions={(r) => (
            <ActionForm action={cancelPayoutAction} className="flex items-center justify-end gap-2">
              <input type="hidden" name="id" value={r.id} />
              <Input name="note" placeholder={t("Reason")} aria-label={t("Reason")} className="!h-8 !w-40 text-[13px]" required />
              <Submit size="sm" variant="ghost">{t("Refuse")}</Submit>
            </ActionForm>
          )}
        />
      </Card>
      <Card className="mt-5">
        <CardHeader title={t("Transfer lists")} />
        <Table head={["List", "Transfers", "Total", "Status", "Reference", "Created"]} empty={batches.length === 0}>
          {batches.map((b) => (
            <tr key={b.id} className="hover:bg-paper/60">
              <Td><Link href={`/admin/finance/payouts/${b.id}`} className="font-mono text-[13px] font-medium text-accent-deep hover:underline">{b.code}</Link></Td>
              <Td className="tnum">{b.count}</Td>
              <Td><Money value={b.total} /></Td>
              <Td><Badge tone={b.status === "paid" ? "success" : "warn"}>{b.status === "paid" ? t("Paid") : t("To send")}</Badge></Td>
              <Td><Mono>{b.reference || "—"}</Mono></Td>
              <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(b.paidAt ?? b.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
