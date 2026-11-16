import { Wand2 } from "lucide-react";
import { assignAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { ParcelTable } from "@/components/parcel-table";
import { Card, CardHeader, PageHeader, Select } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listCouriers } from "@/server/services/directory";
import { listParcels, type ParcelView } from "@/server/services/parcels";

type C = { id: string; name: string; active: number; hub: string | null };

function Board({ title, hint, mode, rows, couriers }: { title: string; hint: string; mode: "pickup" | "delivery"; rows: ParcelView[]; couriers: C[] }) {
  return (
    <Card>
      <ActionForm action={assignAction}>
        <input type="hidden" name="mode" value={mode} />
        <CardHeader
          title={`${title} (${rows.length})`}
          hint={hint}
          action={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Select name="courierId" defaultValue="" aria-label={t("Courier")} className="min-w-0 flex-1 sm:!w-56 sm:flex-none">
                <option value="">{t("Choose courier")}</option>
                {couriers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.hub ? t(c.hub) : "—"} · {t("{n} active", { n: c.active })}</option>)}
              </Select>
              <Submit>{t("Assign selected")}</Submit>
              <Submit variant="ghost" name="auto" value="1"><Wand2 size={15} /> {t("Auto-assign all")}</Submit>
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
  const [pickups, atHub, all] = await Promise.all([
    listParcels(db, { status: "created" }),
    listParcels(db, { status: ["at_destination_hub", "at_origin_hub", "attempt_failed"] }),
    listCouriers(db),
  ]);
  const couriers = all.filter((c) => c.isActive);
  // At the origin hub a parcel is only deliverable when that hub is also its destination hub.
  const deliveries = atHub.filter((p) => p.status !== "at_origin_hub" || (p.originHubId === p.destHubId && !p.bagId));
  return (
    <>
      <PageHeader title={t("Dispatch")} subtitle={t("Tick parcels and choose a courier, or let Masar share the work among the couriers of each hub. Delivery routes are planned as soon as parcels are assigned.")} />
      <div className="space-y-5">
        <Board title={t("Waiting for pickup")} hint={t("New orders at the merchant")} mode="pickup" rows={pickups} couriers={couriers} />
        <Board title={t("Ready for delivery")} hint={t("At the destination hub, including parcels to retry")} mode="delivery" rows={deliveries} couriers={couriers} />
      </div>
    </>
  );
}
