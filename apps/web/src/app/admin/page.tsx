import Link from "next/link";
import { Bars } from "@/components/bars";
import { ParcelTable } from "@/components/parcel-table";
import { Card, CardHeader, LinkButton, Notice, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { STAFF_LABEL } from "@/lib/staff";
import { getDb } from "@/server/db";
import { STATUSES, TERMINAL } from "@/server/domain/state";
import { listMerchants } from "@/server/services/directory";
import { acct, balance, balancesByPrefix } from "@/server/services/ledger";
import { dailyVolume, listParcels, statusCounts } from "@/server/services/parcels";

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const s = await requireStaff("overview");
  const { denied } = await searchParams;
  const db = await getDb();
  const [counts, volume, couriers, merchants, revenue, cash, exceptions, mList] = await Promise.all([
    statusCounts(db),
    dailyVolume(db, 14),
    balancesByPrefix(db, "courier"),
    balancesByPrefix(db, "merchant"),
    balancesByPrefix(db, "revenue"),
    balance(db, acct.companyCash),
    listParcels(db, { status: ["attempt_failed", "return_initiated", "lost"], limit: 6 }),
    listMerchants(db),
  ]);
  const n = (s: (typeof STATUSES)[number]) => counts[s] ?? 0;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const active = STATUSES.filter((s) => !TERMINAL.includes(s)).reduce((a, s) => a + n(s), 0);
  const closed = n("delivered") + n("returned");
  const rate = closed ? Math.round((n("delivered") / closed) * 100) : null;
  const total = Math.max(1, sum(counts as Record<string, number>));
  const pending = mList.filter((m) => m.status === "pending").length;
  const cashRows: [string, number, string][] = [
    ["Held by couriers", sum(couriers), "Collected, not yet handed over"],
    ["Company cash", cash, "Handed over, minus payouts"],
    ["Owed to merchants", -sum(merchants), "COD collected minus fees"],
    ["Fees earned", -sum(revenue), "Delivery and return fees"],
  ];

  return (
    <>
      <PageHeader title={t("Overview")} subtitle={t("What is moving through the network right now.")} action={<LinkButton href="/admin/dispatch">{t("Open dispatch")}</LinkButton>} />
      {denied && (
        <p role="alert" className="mb-5 rounded-xl bg-warn-soft px-4 py-3 text-sm text-ink">
          {t("That page is outside your access ({role}). Ask an owner of the account if you need it.", { role: t(STAFF_LABEL[s.staffRole ?? "owner"]) })}
        </p>
      )}
      {pending > 0 && (
        <Notice tone="info" title={t("New merchant accounts waiting for approval: {n}.", { n: pending })}>
          <Link href="/admin/merchants" className="font-medium underline">{t("Review them")}</Link>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat tone="accent" label={t("In the network")} value={active} hint={t("{n} waiting for pickup", { n: n("created") })} />
        <Stat label={t("Out for delivery")} value={n("out_for_delivery")} hint={t("{n} ready at destination hubs", { n: n("at_destination_hub") })} />
        <Stat label={t("Delivered")} value={n("delivered")} hint={t("{n} returned to merchants", { n: n("returned") })} />
        <Stat label={t("Delivery success")} value={rate ?? "—"} unit={rate === null ? undefined : "%"} hint={t("Delivered out of delivered plus returned")} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("New orders")} hint={t("Per day, last 14 days")} />
          <div className="p-5 pt-8"><Bars data={volume} /></div>
        </Card>
        <Card>
          <CardHeader title={t("Cash position")} action={<Link href="/admin/finance" className="text-sm font-medium text-accent-deep hover:underline">{t("Ledger")}</Link>} />
          <dl className="divide-y divide-line px-5">
            {cashRows.map(([k, v, h]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <dt className="text-sm font-medium">{t(k)}</dt>
                  <dd className="text-xs text-muted">{t(h)}</dd>
                </div>
                <p className="tnum whitespace-nowrap text-end text-[15px] font-semibold">{money(v)} <span className="text-xs font-normal text-muted">{t("DZD")}</span></p>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("By status")} />
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
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title={t("Needs attention")} hint={t("Failed attempts, returns in progress and lost parcels")} />
          <ParcelTable rows={exceptions} base="/admin/parcels" />
        </Card>
      </div>
    </>
  );
}
