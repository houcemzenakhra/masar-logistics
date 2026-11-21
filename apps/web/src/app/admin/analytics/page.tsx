import { CourierTable, Kpis, MerchantTable, PeriodChips, Reasons, Trend, WilayaTable } from "@/components/analytics";
import { PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { PERIODS, byCourier, byMerchant, byWilaya, daily, failureReasons, overview, type Period } from "@/server/services/analytics";

export default async function Analytics({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireRole("admin");
  const asked = Number((await searchParams).days);
  const period: Period = (PERIODS as readonly number[]).includes(asked) ? (asked as Period) : 30;
  const db = await getDb();
  const [o, trend, wilayas, reasons, couriers, merchants] = await Promise.all([
    overview(db, period),
    daily(db, Math.min(period, 30)),
    byWilaya(db, period),
    failureReasons(db, period),
    byCourier(db, period),
    byMerchant(db, period),
  ]);
  return (
    <>
      <PageHeader title={t("Analytics")} subtitle={t("Parcels ordered in the period: how many reached the door, how fast, and where they did not.")} action={<PeriodChips base="/admin/analytics" period={period} />} />
      <Kpis o={o} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Trend data={trend} />
        <Reasons rows={reasons} />
      </div>
      <div className="mt-5 grid gap-5 2xl:grid-cols-2">
        <WilayaTable rows={wilayas} />
        <CourierTable rows={couriers} />
      </div>
      <div className="mt-5"><MerchantTable rows={merchants} /></div>
    </>
  );
}
