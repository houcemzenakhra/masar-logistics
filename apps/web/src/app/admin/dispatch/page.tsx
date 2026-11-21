import { Wand2 } from "lucide-react";
import { assignAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { ParcelTable } from "@/components/parcel-table";
import { Card, CardHeader, PageHeader, Select } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { listCouriers } from "@/server/services/directory";
import { dayName } from "@/lib/format";
import { algeriaToday, waiting } from "@/server/services/dispatch";
import { bookedForDay } from "@/server/services/pickups";
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
  await requireStaff("dispatch", "hub");
  const db = await getDb();
  const today = algeriaToday();
  const [created, due, atHub, all, booked] = await Promise.all([
    listParcels(db, { status: "created" }),
    waiting(db, "pickup"),
    listParcels(db, { status: ["at_destination_hub", "at_origin_hub", "attempt_failed"] }),
    listCouriers(db),
    bookedForDay(db, today),
  ]);
  // Orders waiting for the recipient's yes, or for the merchant's pickup day, are not offered.
  const dueIds = new Set(due.map((d) => d.id));
  const pickups = created.filter((p) => dueIds.has(p.id));
  const held = created.length - pickups.length;
  const couriers = all.filter((c) => c.isActive);
  // At the origin hub a parcel is only deliverable when that hub is also its destination hub.
  // Stop desk parcels go on the desk shelf instead (Stop desks page).
  const deliverable = atHub.filter((p) => p.deliveryType === "home" && (p.status !== "at_origin_hub" || (p.originHubId === p.destHubId && !p.bagId)));
  // Recipients can ask for a later day on the tracking page; those parcels wait, and auto-assign skips them.
  const deliveries = deliverable.filter((p) => !p.preferredDate || p.preferredDate <= today);
  const later = deliverable.filter((p) => p.preferredDate && p.preferredDate > today);
  return (
    <>
      <PageHeader title={t("Dispatch")} subtitle={t("Tick parcels and choose a courier, or let Masar share the work among the couriers of each hub. Delivery routes are planned as soon as parcels are assigned.")} />
      <div className="space-y-5">
        {booked.length > 0 && (
          <Card>
            <CardHeader title={t("Pickups booked for today ({day})", { day: dayName(today) })} />
            <ul className="divide-y divide-line">
              {booked.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">{b.merchant} <span className="ltr font-normal text-muted">{b.phone}</span></p>
                    <p className="text-muted">{b.address}{b.note ? ` · ${b.note}` : ""}</p>
                  </div>
                  <p className="text-end">
                    <span className="font-medium">{b.window === "morning" ? t("Morning") : t("Afternoon")}</span>
                    <span className="block text-muted">{t("{n} orders waiting", { n: b.waiting })}{b.expected > 0 ? ` · ${t("about {n} expected", { n: b.expected })}` : ""}</span>
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Board title={t("Waiting for pickup")} hint={held > 0 ? t("New orders due today. {n} more wait for the recipient's confirmation or the merchant's pickup day.", { n: held }) : t("New orders at the merchant")} mode="pickup" rows={pickups} couriers={couriers} />
        <Board title={t("Ready for delivery")} hint={t("At the destination hub, including parcels to retry")} mode="delivery" rows={deliveries} couriers={couriers} />
        {later.length > 0 && <Board title={t("Waiting for the day the recipient chose")} hint={t("Auto-assign leaves these until their day. You can still assign one by hand.")} mode="delivery" rows={later} couriers={couriers} />}
      </div>
    </>
  );
}
