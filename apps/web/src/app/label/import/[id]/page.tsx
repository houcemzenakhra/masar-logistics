import { notFound } from "next/navigation";
import { Label } from "@/components/label";
import { PrintButton } from "@/components/print-button";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getBatch } from "@/server/services/imports";
import { listParcels } from "@/server/services/parcels";

export const metadata = { title: "Labels" };

/** Every label of one import, one per printed page. */
export default async function ImportLabels({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("merchant");
  const db = await getDb();
  const b = await getBatch(db, (await params).id, s.merchantId!);
  if (!b || b.status !== "committed") notFound();
  const rows = (await listParcels(db, { importId: b.id, limit: 1000 })).sort((a, z) => a.tracking.localeCompare(z.tracking));
  return (
    <main className="mx-auto max-w-md p-4">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("Labels: {n}. Each prints on its own page.", { n: rows.length })}</p>
        <PrintButton />
      </div>
      <div className="space-y-6 print:space-y-0">
        {rows.map((p) => (
          <div key={p.id} className="break-after-page">
            <Label p={p} />
          </div>
        ))}
      </div>
    </main>
  );
}
