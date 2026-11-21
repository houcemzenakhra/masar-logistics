import { ParcelFilters } from "@/components/parcel-filters";
import { ParcelTable } from "@/components/parcel-table";
import { Card, PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { STATUSES, type Status } from "@/server/domain/state";
import { listParcels, statusCounts } from "@/server/services/parcels";

export default async function Parcels({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireStaff("parcels", "hub");
  const { status, q } = await searchParams;
  const st = STATUSES.includes(status as Status) ? (status as Status) : undefined;
  const db = await getDb();
  const [rows, counts] = await Promise.all([listParcels(db, { status: st, search: q }), statusCounts(db)]);
  return (
    <>
      <PageHeader title={t("Parcels")} subtitle={t("Every parcel in the system. Open one to see its history and move it forward.")} />
      <ParcelFilters base="/admin/parcels" status={st} q={q} counts={counts} />
      <Card><ParcelTable rows={rows} base="/admin/parcels" showMerchant /></Card>
    </>
  );
}
