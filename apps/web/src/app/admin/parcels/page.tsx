import Link from "next/link";
import { ParcelTable } from "@/components/parcel-table";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { STATUSES, STATUS_LABEL, type Status } from "@/server/domain/state";
import { listParcels, statusCounts } from "@/server/services/parcels";

export default async function Parcels({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireRole("admin", "hub");
  const { status, q } = await searchParams;
  const st = STATUSES.includes(status as Status) ? (status as Status) : undefined;
  const db = await getDb();
  const [rows, counts] = await Promise.all([listParcels(db, { status: st, search: q }), statusCounts(db)]);
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors ${active ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line hover:bg-paper"}`;
  const href = (s?: string) => `/admin/parcels?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}`;
  return (
    <>
      <PageHeader title="Parcels" subtitle="Every parcel in the system. Open one to see its history and move it forward." />
      <form className="mb-4 flex max-w-md gap-2">
        {st && <input type="hidden" name="status" value={st} />}
        <Input name="q" defaultValue={q} placeholder="Search tracking number, name or phone" aria-label="Search parcels" />
        <Button variant="dark">Search</Button>
      </form>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link href={href()} className={chip(!st)}>All</Link>
        {STATUSES.filter((s) => counts[s]).map((s) => (
          <Link key={s} href={href(s)} className={chip(st === s)}>
            {STATUS_LABEL[s]} <span className="tnum opacity-60">{counts[s]}</span>
          </Link>
        ))}
      </div>
      <Card><ParcelTable rows={rows} base="/admin/parcels" showMerchant /></Card>
    </>
  );
}
