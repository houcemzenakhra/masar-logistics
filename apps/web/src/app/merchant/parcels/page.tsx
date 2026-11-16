import { Plus } from "lucide-react";
import { ParcelFilters } from "@/components/parcel-filters";
import { ParcelTable } from "@/components/parcel-table";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { STATUSES, type Status } from "@/server/domain/state";
import { listParcels, statusCounts } from "@/server/services/parcels";

export default async function Orders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const s = await requireRole("merchant");
  const { status, q } = await searchParams;
  const st = STATUSES.includes(status as Status) ? (status as Status) : undefined;
  const db = await getDb();
  const [rows, counts] = await Promise.all([listParcels(db, { merchantId: s.merchantId, status: st, search: q }), statusCounts(db, s.merchantId)]);
  return (
    <>
      <PageHeader title={t("Orders")} action={<LinkButton href="/merchant/parcels/new"><Plus size={16} /> {t("New order")}</LinkButton>} />
      <ParcelFilters base="/merchant/parcels" status={st} q={q} counts={counts} />
      <Card><ParcelTable rows={rows} base="/merchant/parcels" /></Card>
    </>
  );
}
