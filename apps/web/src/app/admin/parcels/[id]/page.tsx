import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ParcelDetail } from "@/components/parcel-detail";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listCouriers } from "@/server/services/directory";
import { getParcel } from "@/server/services/parcels";

export default async function AdminParcel({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("admin", "hub");
  const db = await getDb();
  const [p, couriers] = await Promise.all([getParcel(db, { id: (await params).id }), listCouriers(db)]);
  if (!p) notFound();
  return (
    <>
      <Link href="/admin/parcels" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Parcels</Link>
      <ParcelDetail p={p} session={s} couriers={couriers} />
    </>
  );
}
