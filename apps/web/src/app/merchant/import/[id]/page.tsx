import { AlertTriangle, ArrowLeft, CheckCircle2, Printer, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { importCommitAction, importDiscardAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, CardHeader, LinkButton, Notice, PageHeader, Stat, Table, Td } from "@/components/ui";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getBatch, type Msg } from "@/server/services/imports";

export const metadata = { title: "Import orders" };
// Creating up to a thousand orders can take a while on a cold database.
export const maxDuration = 60;

const say = (m: Msg) => t(m.m, m.v);

export default async function Batch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const s = await requireRole("merchant");
  const b = await getBatch(await getDb(), (await params).id, s.merchantId!);
  if (!b) notFound();
  const { show } = await searchParams;
  const valid = b.rows.filter((r) => r.values);
  const warned = b.rows.filter((r) => r.values && r.warnings.length).length;
  const rows = show === "problems" ? b.rows.filter((r) => !r.values || r.warnings.length) : b.rows;
  const cod = valid.reduce((a, r) => a + r.values!.codAmount, 0);
  const fees = valid.reduce((a, r) => a + (r.shown?.fee ?? 0), 0);
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset ${on ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line hover:bg-paper"}`;

  return (
    <>
      <Link href="/merchant/import" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" /> {t("Import orders")}</Link>
      <PageHeader title={b.fileName} subtitle={b.status === "draft" ? t("Nothing has been created yet. Check the rows, then confirm.") : undefined} />

      {b.status === "committed" && (
        <Notice tone="info" title={t("Orders created: {n}.", { n: b.createdCount })}>
          <div className="mt-2 flex flex-wrap gap-2">
            <LinkButton href={`/label/import/${b.id}`} target="_blank" size="sm"><Printer size={15} /> {t("Print all labels")}</LinkButton>
            <LinkButton href="/merchant/parcels?status=created" size="sm" variant="ghost">{t("See the orders")}</LinkButton>
          </div>
        </Notice>
      )}
      {b.status === "discarded" && <Notice title={t("This import was discarded. Nothing was created.")} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat tone="accent" label={t("Ready to create")} value={b.validCount} hint={warned ? t("{n} with a note to check", { n: warned }) : undefined} />
        <Stat label={t("With errors")} value={b.invalidCount} hint={b.invalidCount ? t("Left out. Fix them in the file and upload it again.") : undefined} />
        <Stat label={t("Cash to collect")} value={money(cod)} unit={t("DZD")} />
        <Stat label={t("Delivery fees")} value={money(fees)} unit={t("DZD")} />
      </div>

      {b.status === "draft" && (
        <Card className="mt-5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            {valid.length > 0 && (
              <ActionForm action={importCommitAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="batchId" value={b.id} />
                <Submit>{t("Create {n} orders", { n: valid.length })}</Submit>
              </ActionForm>
            )}
            <LinkButton href="/merchant/import" variant="ghost">{t("Upload a corrected file")}</LinkButton>
            <ActionForm action={importDiscardAction}>
              <input type="hidden" name="batchId" value={b.id} />
              <Submit variant="danger">{t("Discard")}</Submit>
            </ActionForm>
          </div>
          {b.invalidCount > 0 && valid.length > 0 && <p className="mt-3 text-sm text-ink-2">{t("Rows with errors are left out. You can create the others now and import the corrected rows later.")}</p>}
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader
          title={t("Rows")}
          action={
            <div className="flex gap-2">
              <Link href={`/merchant/import/${b.id}`} className={chip(show !== "problems")}>{t("All")} <span className="tnum opacity-60">{b.rows.length}</span></Link>
              <Link href={`/merchant/import/${b.id}?show=problems`} className={chip(show === "problems")}>{t("To check")} <span className="tnum opacity-60">{b.invalidCount + warned}</span></Link>
            </div>
          }
        />
        <Table head={["Line", "", "Recipient", "Destination", "COD", "Fee", "Notes"]} empty={rows.length === 0}>
          {rows.map((r) => (
            <tr key={r.line} className={r.values ? "" : "bg-danger-soft/40"}>
              <Td className="tnum text-muted">{r.line}</Td>
              <Td className="w-6 pe-0">
                {!r.values ? <XCircle size={18} className="text-danger" aria-label={t("Error")} /> : r.warnings.length ? <AlertTriangle size={18} className="text-warn" aria-label={t("Check")} /> : <CheckCircle2 size={18} className="text-ok" aria-label={t("Ready")} />}
              </Td>
              <Td className="whitespace-nowrap">
                <p className="font-medium">{r.values?.recipientName ?? (r.raw.name || "—")}</p>
                <p className="ltr text-[13px] text-muted">{r.values?.recipientPhone ?? r.raw.phone}</p>
              </Td>
              <Td className="whitespace-nowrap">
                <p>{r.shown?.wilaya ?? r.raw.wilaya}</p>
                <p className="text-[13px] text-muted">{r.shown?.commune ?? r.raw.commune}</p>
              </Td>
              <Td className="tnum whitespace-nowrap">{r.values ? money(r.values.codAmount) : r.raw.cod}</Td>
              <Td className="tnum whitespace-nowrap text-muted">{r.shown ? money(r.shown.fee) : "—"}</Td>
              <Td className="min-w-64">
                <ul className="space-y-0.5 text-[13px]">
                  {r.errors.map((m, i) => <li key={`e${i}`} className="text-danger">{say(m)}</li>)}
                  {r.warnings.map((m, i) => <li key={`w${i}`} className="text-warn">{say(m)}</li>)}
                </ul>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
