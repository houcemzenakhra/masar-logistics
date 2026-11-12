import { hubScanAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { ParcelTable } from "@/components/parcel-table";
import { Card, CardHeader, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listParcels } from "@/server/services/parcels";

function Station({ direction, title, hint }: { direction: "in" | "out"; title: string; hint: string }) {
  return (
    <Card>
      <CardHeader title={title} hint={hint} />
      <ActionForm action={hubScanAction} className="flex flex-wrap gap-2 p-5">
        <input type="hidden" name="direction" value={direction} />
        <Input name="tracking" required placeholder="Scan or type MSR…" aria-label="Tracking number" autoComplete="off" className="!h-12 min-w-0 flex-1 font-mono !text-base" />
        <Submit size="lg" variant={direction === "in" ? "primary" : "dark"}>{direction === "in" ? "Scan in" : "Scan out"}</Submit>
      </ActionForm>
    </Card>
  );
}

export default async function Scan() {
  await requireRole("admin", "hub");
  const db = await getDb();
  const [incoming, floor] = await Promise.all([
    listParcels(db, { status: ["picked_up", "in_transit", "return_initiated"] }),
    listParcels(db, { status: ["at_origin_hub", "at_destination_hub"] }),
  ]);
  return (
    <>
      <PageHeader title="Hub scan" subtitle="A barcode scanner types the number and presses Enter, so you can scan parcel after parcel." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Station direction="in" title="Scan in" hint="Arriving from a courier, from linehaul, or coming back as a return" />
        <Station direction="out" title="Scan out" hint="Leaving on linehaul to its destination hub" />
      </div>
      <div className="mt-5 space-y-5">
        <Card>
          <CardHeader title={`Expected (${incoming.length})`} hint="On the way to a hub" />
          <ParcelTable rows={incoming} base="/admin/parcels" />
        </Card>
        <Card>
          <CardHeader title={`On the floor (${floor.length})`} hint="Scanned in and waiting" />
          <ParcelTable rows={floor} base="/admin/parcels" />
        </Card>
      </div>
    </>
  );
}
