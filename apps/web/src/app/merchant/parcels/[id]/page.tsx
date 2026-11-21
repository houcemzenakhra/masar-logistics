import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ParcelDetail } from "@/components/parcel-detail";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listClaims } from "@/server/services/claims";
import { listProofs } from "@/server/services/delivery";
import { getParcel } from "@/server/services/parcels";
import { listRequests } from "@/server/services/recipient";

export default async function MerchantParcel({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("merchant");
  const db = await getDb();
  const p = await getParcel(db, { id: (await params).id });
  if (!p || p.merchantId !== s.merchantId) notFound();
  const [proofs, requests, claims] = await Promise.all([listProofs(db, p.id), listRequests(db, p.id), listClaims(db, { merchantId: s.merchantId }).then((c) => c.filter((x) => x.parcelId === p.id))]);
  return (
    <>
      <Link href="/merchant/parcels" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" /> {t("Orders")}</Link>
      <ParcelDetail p={p} session={s} door={{ proofs, requests, claims }} />
    </>
  );
}
