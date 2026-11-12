import { assignAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { ParcelTable } from "@/components/parcel-table";
import { Card, CardHeader, PageHeader, Select } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listCouriers } from "@/server/services/directory";
import { listParcels, type ParcelView } from "@/server/services/parcels";

function Board({ title, hint, mode, rows, couriers }: { title: string; hint: string; mode: "pickup" | "delivery"; rows: ParcelView[]; couriers: { id: string; name: string; active: number }[] }) {
  return (
    <Card>
      <ActionForm action={assignAction}>
        <input type="hidden" name="mode" value={mode} />
        <CardHeader
          title={`${title} (${rows.length})`}
          hint={hint}
          action={
            <div className="flex items-center gap-2">
              <Select name="courierId" defaultValue="" required aria-label="Courier" className="!w-52">
                <option value="" disabled>Choose courier</option>
                {couriers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.active} active</option>)}
              </Select>
              <Submit>Assign selected</Submit>
            </div>
          }
        />
        <ParcelTable rows={rows} base="/admin/parcels" showMerchant select />
      </ActionForm>
    </Card>
  );
}

export default async function Dispatch() {
  await requireRole("admin", "hub");
  const db = await getDb();
  const [pickups, atHub, couriers] = await Promise.all([
    listParcels(db, { status: "created" }),
    listParcels(db, { status: ["at_destination_hub", "at_origin_hub", "attempt_failed"] }),
    listCouriers(db),
  ]);
  // At the origin hub a parcel is only deliverable when that hub is also its destination hub.
  const deliveries = atHub.filter((p) => p.status !== "at_origin_hub" || p.originHubId === p.destHubId);
  return (
    <>
      <PageHeader title="Dispatch" subtitle="Tick parcels, choose a courier, assign. The courier sees them on their run sheet straight away." />
      <div className="space-y-5">
        <Board title="Waiting for pickup" hint="New orders at the merchant" mode="pickup" rows={pickups} couriers={couriers} />
        <Board title="Ready for delivery" hint="At the destination hub, including parcels to retry" mode="delivery" rows={deliveries} couriers={couriers} />
      </div>
    </>
  );
}
