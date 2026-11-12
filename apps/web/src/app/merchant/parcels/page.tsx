import { Plus } from "lucide-react";
import Link from "next/link";
import { ParcelTable } from "@/components/parcel-table";
import { Button, Card, Input, LinkButton, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { STATUSES, STATUS_LABEL, type Status } from "@/server/domain/state";
import { listParcels, statusCounts } from "@/server/services/parcels";

export default async function Orders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const s = await requireRole("merchant");
  const { status, q } = await searchParams;
  const st = STATUSES.includes(status as Status) ? (status as Status) : undefined;
  const db = await getDb();
  const [rows, counts] = await Promise.all([listParcels(db, { merchantId: s.merchantId, status: st, search: q }), statusCounts(db, s.merchantId)]);
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors ${active ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line hover:bg-paper"}`;
  return (
    <>
      <PageHeader title="Orders" action={<LinkButton href="/merchant/parcels/new"><Plus size={16} /> New order</LinkButton>} />
      <form className="mb-4 flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Search tracking number, name or phone" aria-label="Search orders" />
        <Button variant="dark">Search</Button>
      </form>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link href="/merchant/parcels" className={chip(!st)}>All</Link>
        {STATUSES.filter((k) => counts[k]).map((k) => (
          <Link key={k} href={`/merchant/parcels?status=${k}`} className={chip(st === k)}>
            {STATUS_LABEL[k]} <span className="tnum opacity-60">{counts[k]}</span>
          </Link>
        ))}
      </div>
      <Card><ParcelTable rows={rows} base="/merchant/parcels" /></Card>
    </>
  );
}
