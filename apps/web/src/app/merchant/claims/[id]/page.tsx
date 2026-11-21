import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimSummary } from "@/components/claims";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getClaim } from "@/server/services/claims";

export default async function MerchantClaim({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("merchant");
  const c = await getClaim(await getDb(), (await params).id);
  if (!c || c.merchantId !== s.merchantId) notFound();
  return (
    <>
      <Link href="/merchant/claims" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" /> {t("Claims")}</Link>
      <div className="max-w-3xl"><ClaimSummary c={c} parcelHref={`/merchant/parcels/${c.parcelId}`} /></div>
    </>
  );
}
