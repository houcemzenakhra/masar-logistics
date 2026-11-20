import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ParcelDetail } from "@/components/parcel-detail";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listCouriers } from "@/server/services/directory";
import { getBag } from "@/server/services/linehaul";
import { getParcel } from "@/server/services/parcels";
import { listSms } from "@/server/services/sms";

export default async function AdminParcel({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("admin", "hub");
  const db = await getDb();
  const [p, couriers] = await Promise.all([getParcel(db, { id: (await params).id }), listCouriers(db)]);
  if (!p) notFound();
  const [bag, sms] = await Promise.all([p.bagId ? getBag(db, p.bagId) : null, listSms(db, { parcelId: p.id, limit: 20 })]);
  return (
    <>
      <Link href="/admin/parcels" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" /> {t("Parcels")}</Link>
      <ParcelDetail p={p} session={s} couriers={couriers.filter((c) => c.isActive)} bag={bag} sms={sms} />
    </>
  );
}
