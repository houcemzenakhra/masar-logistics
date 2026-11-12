import Link from "next/link";
import { Bars } from "@/components/bars";
import { ParcelTable } from "@/components/parcel-table";
import { Card, CardHeader, LinkButton, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { money } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { STATUSES, TERMINAL } from "@/server/domain/state";
import { acct, balance, balancesByPrefix } from "@/server/services/ledger";
import { dailyVolume, listParcels, statusCounts } from "@/server/services/parcels";

export default async function Overview() {
  await requireRole("admin");
  const db = await getDb();
  const [counts, volume, couriers, merchants, revenue, cash, exceptions] = await Promise.all([
    statusCounts(db),
    dailyVolume(db, 14),
    balancesByPrefix(db, "courier"),
    balancesByPrefix(db, "merchant"),
    balancesByPrefix(db, "revenue"),
    balance(db, acct.companyCash),
    listParcels(db, { status: ["attempt_failed", "return_initiated", "lost"], limit: 6 }),
  ]);
  const n = (s: (typeof STATUSES)[number]) => counts[s] ?? 0;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const active = STATUSES.filter((s) => !TERMINAL.includes(s)).reduce((a, s) => a + n(s), 0);
  const closed = n("delivered") + n("returned");
  const rate = closed ? Math.round((n("delivered") / closed) * 100) : null;
  const total = Math.max(1, sum(counts as Record<string, number>));

  return (
    <>
      <PageHeader title="Overview" subtitle="What is moving through the network right now." action={<LinkButton href="/admin/dispatch">Open dispatch</LinkButton>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat tone="accent" label="In the network" value={active} hint={`${n("created")} waiting for pickup`} />
        <Stat label="Out for delivery" value={n("out_for_delivery")} hint={`${n("at_destination_hub")} ready at destination hubs`} />
        <Stat label="Delivered" value={n("delivered")} hint={`${n("returned")} returned to merchants`} />
        <Stat label="Delivery success" value={rate ?? "—"} unit={rate === null ? undefined : "%"} hint="Delivered out of delivered plus returned" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="New orders" hint="Per day, last 14 days" />
          <div className="p-5 pt-8"><Bars data={volume} /></div>
        </Card>
        <Card>
          <CardHeader title="Cash position" action={<Link href="/admin/finance" className="text-sm font-medium text-accent-deep hover:underline">Ledger</Link>} />
          <dl className="divide-y divide-line px-5">
            {[
              ["Held by couriers", sum(couriers), "Collected, not yet handed over"],
              ["Company cash", cash, "Handed over, minus payouts"],
              ["Owed to merchants", -sum(merchants), "COD collected minus fees"],
              ["Fees earned", -sum(revenue), "Delivery and return fees"],
            ].map(([k, v, h]) => (
              <div key={k as string} className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <dt className="text-sm font-medium">{k}</dt>
                  <dd className="text-xs text-muted">{h}</dd>
                </div>
                <p className="tnum text-right text-[15px] font-semibold">{money(v as number)} <span className="text-xs font-normal text-muted">DZD</span></p>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="By status" />
          <ul className="space-y-3 p-5">
            {STATUSES.filter((s) => n(s) > 0).map((s) => (
              <li key={s}>
                <Link href={`/admin/parcels?status=${s}`} className="group block">
                  <div className="flex items-center justify-between text-sm">
                    <StatusBadge status={s} />
                    <span className="tnum font-medium">{n(s)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
                    <div className="h-full rounded-full bg-navy/70 group-hover:bg-accent" style={{ width: `${(n(s) / total) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Needs attention" hint="Failed attempts, returns in progress and lost parcels" />
          <ParcelTable rows={exceptions} base="/admin/parcels" />
        </Card>
      </div>
    </>
  );
}
