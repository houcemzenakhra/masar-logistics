import { Kpis, PeriodChips, Reasons, Trend, WilayaTable } from "@/components/analytics";
import { PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { PERIODS, byWilaya, daily, failureReasons, overview, type Period } from "@/server/services/analytics";

/** The merchant's own numbers: where their orders reach the door, and where they come back. */
export default async function MerchantAnalytics({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const s = await requireRole("merchant");
  const asked = Number((await searchParams).days);
  const period: Period = (PERIODS as readonly number[]).includes(asked) ? (asked as Period) : 30;
  const db = await getDb();
  const [o, trend, wilayas, reasons] = await Promise.all([overview(db, period, s.merchantId), daily(db, Math.min(period, 30), s.merchantId), byWilaya(db, period, s.merchantId), failureReasons(db, period, s.merchantId)]);
  return (
    <>
      <PageHeader title={t("Reports")} subtitle={t("Your orders in the period: how many reached the door, and where they came back.")} action={<PeriodChips base="/merchant/analytics" period={period} />} />
      <Kpis o={o} money={false} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Trend data={trend} />
        <Reasons rows={reasons} />
      </div>
      <div className="mt-5"><WilayaTable rows={wilayas} limit={69} /></div>
    </>
  );
}
