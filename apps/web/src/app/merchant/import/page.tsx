import { Download, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { importUploadAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, CardHeader, PageHeader, Table, Td } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { MAX_ROWS, listBatches } from "@/server/services/imports";

export const metadata = { title: "Import orders" };

const STATUS = { draft: ["To review", "warn"], committed: ["Created", "success"], discarded: ["Discarded", "neutral"] } as const;

const COLUMNS: [string, string, boolean][] = [
  ["Name", "Recipient's full name", true],
  ["Phone", "Mobile number. 0550 12 34 56, +213 550 12 34 56 and 550123456 all work.", true],
  ["Wilaya", "Code (16) or name (Alger, الجزائر).", true],
  ["Commune", "Name in French or Arabic. Small spelling mistakes are corrected and shown to you.", true],
  ["Address", "Street, building or a landmark.", true],
  ["COD", "Amount to collect in dinars. 0 if already paid.", true],
  ["Weight", "In kg. 1 if left empty.", false],
  ["Contents", "What is in the parcel.", false],
  ["SMS language", "fr or ar. French if left empty.", false],
];

export default async function Import() {
  const s = await requireRole("merchant");
  const batches = await listBatches(await getDb(), s.merchantId!);
  return (
    <>
      <PageHeader title={t("Import orders")} subtitle={t("Upload a spreadsheet of orders. Every row is checked before anything is created, and you confirm at the end.")} />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="p-5 sm:p-6">
          <ActionForm action={importUploadAction} className="space-y-4">
            <label className="flex min-w-0 cursor-pointer flex-col overflow-hidden items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-paper/60 px-6 py-10 text-center transition-colors hover:border-accent/50 hover:bg-accent-soft/40">
              <FileSpreadsheet size={32} className="text-accent" />
              <span className="font-medium">{t("Choose a .xlsx or .csv file")}</span>
              <span className="text-sm text-muted">{t("Up to {n} orders and 2 MB per file.", { n: MAX_ROWS })}</span>
              <input name="file" type="file" required accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="w-full max-w-full min-w-0 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-sm file:text-white" />
            </label>
            <Submit>{t("Check the file")}</Submit>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">{t("Template")}</h2>
          <p className="mt-1 text-sm text-muted">{t("Start from the template, or use your own file: columns are recognised by their title in English, French or Arabic, in any order.")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["fr", "ar", "en"] as const).map((l) => (
              <a key={l} href={`/merchant/import/template?lang=${l}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface px-3 text-sm font-medium ring-1 ring-inset ring-line hover:bg-paper">
                <Download size={15} /> {{ fr: "Français", ar: "العربية", en: "English" }[l]}
              </a>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title={t("Columns")} hint={t("The first row of the file names the columns.")} />
        <Table head={["Column", "What to write", ""]}>
          {COLUMNS.map(([c, d, req]) => (
            <tr key={c}>
              <Td className="whitespace-nowrap font-medium">{t(c)}</Td>
              <Td className="text-ink-2">{t(d)}</Td>
              <Td>{req ? <Badge tone="info">{t("Required")}</Badge> : <span className="text-[13px] text-muted">{t("Optional")}</span>}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      {batches.length > 0 && (
        <Card className="mt-5">
          <CardHeader title={t("Recent imports")} />
          <Table head={["File", "Uploaded", "Ready", "With errors", "Created", "Status"]}>
            {batches.map((b) => (
              <tr key={b.id} className="hover:bg-paper/60">
                <Td><Link href={`/merchant/import/${b.id}`} className="font-medium hover:text-accent-deep hover:underline">{b.fileName}</Link></Td>
                <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(b.createdAt)}</Td>
                <Td className="tnum">{b.validCount}</Td>
                <Td className="tnum">{b.invalidCount}</Td>
                <Td className="tnum">{b.createdCount}</Td>
                <Td><Badge tone={STATUS[b.status][1]}>{t(STATUS[b.status][0])}</Badge></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
