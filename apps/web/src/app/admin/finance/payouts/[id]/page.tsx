import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markBatchPaidAction, removeFromBatchAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { PayoutTable } from "@/components/payouts";
import { Badge, Card, CardHeader, Field, Input, DownloadButton, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { getBatch, listPayoutRequests } from "@/server/services/money";

export default async function Batch({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("finance");
  const db = await getDb();
  const b = await getBatch(db, (await params).id);
  if (!b) notFound();
  const rows = await listPayoutRequests(db, { batchId: b.id });
  return (
    <>
      <Link href="/admin/finance/payouts" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" /> {t("Payouts")}</Link>
      <PageHeader
        title={b.code}
        subtitle={t("{n} transfers, {x} DZD in all.", { n: b.count, x: money(b.total) })}
        action={<Badge tone={b.status === "paid" ? "success" : "warn"}>{b.status === "paid" ? t("Paid") : t("To send")}</Badge>}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title={t("Transfers")} action={<DownloadButton href={`/admin/finance/payouts/${b.id}/csv`} variant="ghost" size="sm"><Download size={15} /> {t("Download for the bank (CSV)")}</DownloadButton>} />
          <PayoutTable
            rows={rows}
            merchant
            actions={
              b.status === "open"
                ? (r) => (
                    <ActionForm action={removeFromBatchAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <Submit size="sm" variant="ghost">{t("Take out")}</Submit>
                    </ActionForm>
                  )
                : undefined
            }
          />
        </Card>
        {b.status === "open" ? (
          <Card>
            <CardHeader title={t("Mark as paid")} hint={t("Once the bank or the post office has made the transfers. Each merchant's balance goes down and they are told.")} />
            <ActionForm action={markBatchPaidAction} className="space-y-4 p-5">
              <input type="hidden" name="batchId" value={b.id} />
              <Field label={t("Transfer reference")}><Input name="reference" required maxLength={80} /></Field>
              <Submit className="w-full">{t("Mark {x} DZD as paid", { x: money(b.total) })}</Submit>
            </ActionForm>
          </Card>
        ) : (
          <Card className="p-5 text-sm">
            <p className="text-muted">{t("Transfer reference")}</p>
            <p className="mt-1 font-mono">{b.reference}</p>
          </Card>
        )}
      </div>
    </>
  );
}
