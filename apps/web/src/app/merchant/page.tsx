import { Plus } from "lucide-react";
import { Bars } from "@/components/bars";
import { ParcelTable } from "@/components/parcel-table";
import { Card, CardHeader, LinkButton, PageHeader, Stat } from "@/components/ui";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { STATUSES, TERMINAL } from "@/server/domain/state";
import { merchantOwed } from "@/server/services/ledger";
import { dailyVolume, listParcels, statusCounts } from "@/server/services/parcels";

export default async function MerchantHome() {
  const s = await requireRole("merchant");
  const db = await getDb();
  const mid = s.merchantId!;
  const [counts, volume, owed, recent] = await Promise.all([statusCounts(db, mid), dailyVolume(db, 14, mid), merchantOwed(db, mid), listParcels(db, { merchantId: mid, limit: 6 })]);
  const n = (k: (typeof STATUSES)[number]) => counts[k] ?? 0;
  const active = STATUSES.filter((k) => !TERMINAL.includes(k)).reduce((a, k) => a + n(k), 0);
  const closed = n("delivered") + n("returned");
  return (
    <>
      <PageHeader title={t("Hello, {name}", { name: s.name })} subtitle={t("Your orders and your cash on delivery balance.")} action={<LinkButton href="/merchant/parcels/new"><Plus size={16} /> {t("New order")}</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat tone="accent" label={t("Balance owed to you")} value={money(owed)} unit={t("DZD")} hint={t("Collected cash minus fees, not yet paid out")} />
        <Stat label={t("On the way")} value={active} hint={t("{n} out for delivery today", { n: n("out_for_delivery") })} />
        <Stat label={t("Delivered")} value={n("delivered")} hint={t("{n} returned", { n: n("returned") })} />
        <Stat label={t("Delivery success")} value={closed ? Math.round((n("delivered") / closed) * 100) : "—"} unit={closed ? "%" : undefined} hint={t("Delivered out of delivered plus returned")} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("Orders created")} hint={t("Per day, last 14 days")} />
          <div className="p-5 pt-8"><Bars data={volume} /></div>
        </Card>
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title={t("Latest activity")} action={<LinkButton href="/merchant/parcels" variant="ghost" size="sm">{t("All orders")}</LinkButton>} />
          <ParcelTable rows={recent} base="/merchant/parcels" />
        </Card>
      </div>
    </>
  );
}
