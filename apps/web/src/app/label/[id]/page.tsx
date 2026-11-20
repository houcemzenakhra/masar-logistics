import { notFound } from "next/navigation";
import { Label } from "@/components/label";
import { PrintButton } from "@/components/print-button";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getParcel } from "@/server/services/parcels";

export const metadata = { title: "Label" };

export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("merchant", "admin", "hub");
  const p = await getParcel(await getDb(), { id: (await params).id });
  if (!p || (s.role === "merchant" && p.merchantId !== s.merchantId)) notFound();
  return (
    <main className="mx-auto max-w-md p-4">
      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{t("Shipping label, 100 × 150 mm")}</p>
        <PrintButton />
      </div>
      <Label p={p} />
    </main>
  );
}
