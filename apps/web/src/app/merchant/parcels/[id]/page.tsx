import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ParcelDetail } from "@/components/parcel-detail";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getParcel } from "@/server/services/parcels";

export default async function MerchantParcel({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("merchant");
  const p = await getParcel(await getDb(), { id: (await params).id });
  if (!p || p.merchantId !== s.merchantId) notFound();
  return (
    <>
      <Link href="/merchant/parcels" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Orders</Link>
      <ParcelDetail p={p} session={s} />
    </>
  );
}
