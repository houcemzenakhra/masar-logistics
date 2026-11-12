import { Printer } from "lucide-react";
import { transitionAction } from "@/app/actions";
import { dateTime } from "@/lib/format";
import type { Session } from "@/server/auth";
import { STATUS_LABEL, nextStatuses, type Status } from "@/server/domain/state";
import type { getParcel } from "@/server/services/parcels";
import { ActionForm, Submit } from "./forms";
import { ProgressRail, Timeline } from "./tracking";
import { Card, CardHeader, LinkButton, Money, Select, StatusBadge } from "./ui";

type Parcel = NonNullable<Awaited<ReturnType<typeof getParcel>>>;

const VERB: Partial<Record<Status, string>> = {
  pickup_assigned: "Assign pickup",
  picked_up: "Mark picked up",
  created: "Unassign pickup",
  at_origin_hub: "Receive at origin hub",
  in_transit: "Dispatch to destination hub",
  at_destination_hub: "Receive at destination hub",
  out_for_delivery: "Send out for delivery",
  delivered: "Mark delivered",
  attempt_failed: "Record failed attempt",
  return_initiated: "Start return",
  returned: "Mark returned to merchant",
  cancelled: "Cancel order",
  lost: "Mark lost",
};
const DANGER: Status[] = ["cancelled", "lost", "attempt_failed", "return_initiated"];

function whereNow(p: Parcel) {
  if (p.status === "delivered") return "Delivered";
  if (p.status === "returned") return "Back with merchant";
  if (p.status === "in_transit") return "On linehaul";
  if (p.status === "created" || p.status === "pickup_assigned" || p.status === "cancelled") return "With merchant";
  if (p.currentHub) return p.currentHub;
  return p.courierName ? `With ${p.courierName}` : "—";
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2.5 text-sm">
    <dt className="text-muted">{k}</dt>
    <dd className="text-right font-medium">{children}</dd>
  </div>
);

export function ParcelDetail({ p, session, couriers = [] }: { p: Parcel; session: Session; couriers?: { id: string; name: string }[] }) {
  const next = nextStatuses(p.status as Status, session.role);
  const net = p.codAmount - p.deliveryFee;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Tracking number</p>
              <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight">{p.tracking}</h1>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={p.status} />
              <LinkButton href={`/label/${p.id}`} target="_blank" variant="ghost" size="sm"><Printer size={15} /> Label</LinkButton>
            </div>
          </div>
          <div className="mt-7"><ProgressRail status={p.status} /></div>
        </Card>

        {next.length > 0 && (
          <Card>
            <CardHeader title="Next step" hint="Only the moves allowed from the current status are shown." />
            <div className="flex flex-wrap gap-3 p-5">
              {next.map((to) => {
                const needsCourier = to === "pickup_assigned" || to === "out_for_delivery";
                return (
                  <ActionForm key={to} action={transitionAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="parcelId" value={p.id} />
                    <input type="hidden" name="to" value={to} />
                    {needsCourier && (
                      <Select name="courierId" required defaultValue={p.courierId ?? ""} aria-label="Courier" className="!w-44">
                        <option value="" disabled>Choose courier</option>
                        {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    )}
                    <Submit variant={DANGER.includes(to) ? "danger" : to === "delivered" ? "primary" : "dark"}>{VERB[to] ?? STATUS_LABEL[to]}</Submit>
                  </ActionForm>
                );
              })}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="History" />
          <div className="p-6"><Timeline events={p.events} showActor /></div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Recipient</h2>
          <dl className="mt-2 divide-y divide-line">
            <Row k="Name">{p.recipientName}</Row>
            <Row k="Phone">{p.recipientPhone}</Row>
            <Row k="Wilaya">{p.destWilaya}</Row>
            <Row k="Commune">{p.commune}</Row>
            <Row k="Address">{p.address}</Row>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Money</h2>
          <dl className="mt-2 divide-y divide-line">
            <Row k="Cash to collect"><Money value={p.codAmount} /></Row>
            <Row k="Delivery fee"><Money value={p.deliveryFee} /></Row>
            <Row k={net >= 0 ? "Merchant receives" : "Merchant pays"}><Money value={Math.abs(net)} className="text-ok" /></Row>
            <Row k="Fee if returned"><Money value={p.returnFee} /></Row>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Shipment</h2>
          <dl className="mt-2 divide-y divide-line">
            <Row k="Merchant">{p.merchantName}</Row>
            <Row k="Contents">{p.description || "—"}</Row>
            <Row k="Weight">{p.weightKg} kg</Row>
            <Row k="Destination hub">{p.destHub}</Row>
            <Row k="Now at">{whereNow(p)}</Row>
            <Row k="Delivery attempts">{p.attempts}</Row>
            <Row k="Created">{dateTime(p.createdAt)}</Row>
          </dl>
        </Card>
      </div>
    </div>
  );
}
