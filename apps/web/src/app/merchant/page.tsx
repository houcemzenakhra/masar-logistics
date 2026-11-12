import { Plus } from "lucide-react";
import { Bars } from "@/components/bars";
import { ParcelTable } from "@/components/parcel-table";
import { Card, CardHeader, LinkButton, PageHeader, Stat } from "@/components/ui";
import { money } from "@/lib/format";
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
      <PageHeader title={`Hello, ${s.name}`} subtitle="Your orders and your cash on delivery balance." action={<LinkButton href="/merchant/parcels/new"><Plus size={16} /> New order</LinkButton>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat tone="accent" label="Balance owed to you" value={money(owed)} unit="DZD" hint="Collected cash minus fees, not yet paid out" />
        <Stat label="On the way" value={active} hint={`${n("out_for_delivery")} out for delivery today`} />
        <Stat label="Delivered" value={n("delivered")} hint={`${n("returned")} returned`} />
        <Stat label="Delivery success" value={closed ? Math.round((n("delivered") / closed) * 100) : "—"} unit={closed ? "%" : undefined} hint="Delivered out of delivered plus returned" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Orders created" hint="Per day, last 14 days" />
          <div className="p-5 pt-8"><Bars data={volume} /></div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Latest activity" action={<LinkButton href="/merchant/parcels" variant="ghost" size="sm">All orders</LinkButton>} />
          <ParcelTable rows={recent} base="/merchant/parcels" />
        </Card>
      </div>
    </>
  );
}
