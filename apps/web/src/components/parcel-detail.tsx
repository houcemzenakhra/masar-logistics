import { MessageSquareQuote, Printer, Star } from "lucide-react";
import Link from "next/link";
import { confirmOrderAction, deliverAction, measureAction, transitionAction } from "@/app/actions";
import { dateTime } from "@/lib/format";
import { place, t } from "@/lib/i18n";
import type { Session } from "@/server/auth";
import { STATUS_LABEL, nextStatuses, type Status } from "@/server/domain/state";
import type { listClaims } from "@/server/services/claims";
import type { listProofs } from "@/server/services/delivery";
import { FAIL_REASONS, REASON_TEXT } from "@/server/services/notify";
import type { getParcel } from "@/server/services/parcels";
import type { listRequests } from "@/server/services/recipient";
import type { RecipientHistory, linkedParcels } from "@/server/services/returns";
import { ActionForm, Submit } from "./forms";
import { ProgressRail, Timeline } from "./tracking";
import { Badge, Card, CardHeader, Field, Input, LinkButton, Money, Select, StatusBadge } from "./ui";

type Parcel = NonNullable<Awaited<ReturnType<typeof getParcel>>>;
export type DoorInfo = {
  proofs: Awaited<ReturnType<typeof listProofs>>;
  requests: Awaited<ReturnType<typeof listRequests>>;
  claims: Awaited<ReturnType<typeof listClaims>>;
};
export type ReturnsInfo = { history: RecipientHistory | null } & Awaited<ReturnType<typeof linkedParcels>>;

const PROOF_LABEL = { code: "Recipient's code", photo: "Photo", signature: "Signature" } as const;
const CLAIM_STATUS = { open: ["Under review", "warn"], approved: ["Approved", "success"], rejected: ["Declined", "danger"] } as const;
const reasonLabel = (r: string | null) => (r && r in REASON_TEXT ? t(REASON_TEXT[r as keyof typeof REASON_TEXT].en) : null);

/** What happened at the door and what the recipient asked for. */
function Door({ p, door, session }: { p: Parcel; door: DoorInfo; session: Session }) {
  const canClaim = session.role === "merchant" && ["delivered", "returned", "lost"].includes(p.status) && !door.claims.some((c) => c.status !== "rejected");
  const has = door.proofs.length || p.failReason || p.preferredDate || p.instructions || p.rating || door.requests.length || door.claims.length || canClaim;
  if (!has) return null;
  return (
    <Card>
      <CardHeader title={t("At the door")} />
      <div className="space-y-5 p-5">
        {door.proofs.length > 0 && (
          <div>
            <h3 className="text-sm font-medium">{t("Proof of delivery")}</h3>
            <div className="mt-2 flex flex-wrap gap-3">
              {door.proofs.map((x) =>
                x.kind === "code" ? (
                  <span key={x.id} className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">{t("Recipient's code checked")}</span>
                ) : (
                  <a key={x.id} href={`/api/v1/parcels/${p.id}/proofs/${x.id}`} target="_blank" className="block overflow-hidden rounded-xl ring-1 ring-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/v1/parcels/${p.id}/proofs/${x.id}`} alt={t(PROOF_LABEL[x.kind])} className={`h-28 w-auto ${x.kind === "signature" ? "bg-white p-2" : "object-cover"}`} />
                    <span className="block bg-paper px-2 py-1 text-[12px] text-muted">{t(PROOF_LABEL[x.kind])}</span>
                  </a>
                ),
              )}
            </div>
            {door.proofs[0].receivedBy && <p className="mt-2 text-sm text-ink-2">{t("Received by {name}", { name: door.proofs[0].receivedBy })}</p>}
          </div>
        )}
        <dl className="divide-y divide-line">
          {p.failReason && p.status !== "delivered" && <Row k="Last failed attempt">{reasonLabel(p.failReason)}</Row>}
          {p.preferredDate && p.status !== "delivered" && <Row k="Recipient asked for">{p.preferredDate}</Row>}
          {p.instructions && <Row k="Directions from the recipient"><span dir="auto">{p.instructions}</span></Row>}
          {p.rating != null && (
            <Row k="Rating">
              <span className="inline-flex items-center gap-0.5 text-warn" aria-label={t("{n} out of 5", { n: p.rating })}>
                {Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} fill={i < p.rating! ? "currentColor" : "none"} />)}
              </span>
            </Row>
          )}
        </dl>
        {p.ratingComment && <p dir="auto" className="flex gap-2 text-sm text-ink-2"><MessageSquareQuote size={16} className="shrink-0 text-muted" />{p.ratingComment}</p>}
        {door.claims.length > 0 && (
          <div>
            <h3 className="text-sm font-medium">{t("Claims")}</h3>
            <ul className="mt-2 space-y-2">
              {door.claims.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/${session.role === "merchant" ? "merchant" : "admin"}/claims/${c.id}`} className="font-mono text-accent-deep hover:underline">{c.code}</Link>
                  <Badge tone={CLAIM_STATUS[c.status][1]}>{t(CLAIM_STATUS[c.status][0])}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        {canClaim && <LinkButton href={`/merchant/claims/new?tracking=${p.tracking}`} variant="ghost" size="sm">{t("Report a problem with this parcel")}</LinkButton>}
      </div>
    </Card>
  );
}

const VERB: Partial<Record<Status, string>> = {
  pickup_assigned: "Assign pickup",
  picked_up: "Mark picked up",
  created: "Unassign pickup",
  at_origin_hub: "Receive at origin hub",
  in_transit: "Dispatch to destination hub",
  at_destination_hub: "Receive at destination hub",
  out_for_delivery: "Send out for delivery",
  ready_for_pickup: "Put on the desk shelf",
  delivered: "Mark delivered",
  attempt_failed: "Record failed attempt",
  return_initiated: "Start return",
  returned: "Mark returned to merchant",
  cancelled: "Cancel order",
  lost: "Mark lost",
};
const CONFIRMATION = { none: "Not needed", pending: "Waiting for the recipient", confirmed: "Confirmed", declined: "Declined" } as const;
const DANGER: Status[] = ["cancelled", "lost", "attempt_failed", "return_initiated"];

function whereNow(p: Parcel) {
  if (p.status === "delivered") return t("Delivered");
  if (p.status === "returned") return t("Back with merchant");
  if (p.status === "in_transit") return t("On linehaul");
  if (p.status === "created" || p.status === "pickup_assigned" || p.status === "cancelled") return t("With merchant");
  if (p.currentHub) return t(p.currentHub);
  return p.courierName ? t("With {name}", { name: p.courierName }) : "—";
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2.5 text-sm">
    <dt className="shrink-0 text-muted">{t(k)}</dt>
    <dd className="text-end font-medium">{children}</dd>
  </div>
);

type Sms = { id: string; kind: string; status: string; createdAt: Date; body: string };
const SMS_KIND: Record<string, string> = { confirm_order: "Order confirmation", ready_at_desk: "Ready at stop desk", out_for_delivery: "Out for delivery", attempt_failed: "Delivery failed", delivered: "Delivered" };
const SMS_STATUS: Record<string, [string, "success" | "danger" | "warn" | "neutral"]> = { sent: ["Sent", "success"], failed: ["Failed", "danger"], simulated: ["Test mode", "warn"], queued: ["Queued", "neutral"], sending: ["Sending", "neutral"] };

/** Waiting for the recipient's yes: the merchant or operations can answer for them after a call. */
function Confirmation({ p }: { p: Parcel }) {
  return (
    <Card className="border-warn/40 bg-warn-soft/40">
      <CardHeader title={t("Waiting for the recipient to confirm")} hint={t("They got a text message with a link. It is picked up once they confirm. If you called them, answer for them here.")} />
      <div className="flex flex-wrap gap-3 p-5">
        <ActionForm action={confirmOrderAction}>
          <input type="hidden" name="parcelId" value={p.id} />
          <input type="hidden" name="answer" value="yes" />
          <Submit>{t("Confirmed by phone")}</Submit>
        </ActionForm>
        <ActionForm action={confirmOrderAction}>
          <input type="hidden" name="parcelId" value={p.id} />
          <input type="hidden" name="answer" value="no" />
          <Submit variant="danger">{t("Recipient declined: cancel")}</Submit>
        </ActionForm>
      </div>
    </Card>
  );
}

/** Handing the parcel over: at the door (admin), or at the stop desk against the recipient's code. */
function HandOver({ p, session }: { p: Parcel; session: Session }) {
  const desk = p.status === "ready_for_pickup";
  return (
    <ActionForm action={deliverAction} className="grid w-full gap-3 sm:grid-cols-2">
      <input type="hidden" name="parcelId" value={p.id} />
      <Field label={t("Code from the recipient's text message")} hint={desk || session.role !== "admin" ? undefined : t("Optional for operations.")}>
        <Input name="code" inputMode="numeric" maxLength={4} required={desk && session.role !== "admin"} dir="ltr" className="tnum" />
      </Field>
      <Field label={t("Collected by (optional)")}><Input name="receivedBy" maxLength={80} /></Field>
      {p.allowPartial && p.codAmount > 0 && (
        <details className="rounded-xl bg-paper p-4 ring-1 ring-inset ring-line sm:col-span-2">
          <summary className="cursor-pointer text-sm font-medium">{t("The recipient keeps only part of the order")}</summary>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="partial" className="size-4 accent-[#ff5b24]" /> {t("Partial delivery")}
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={t("Cash collected (DZD)")}><Input name="collected" inputMode="numeric" dir="ltr" className="tnum" /></Field>
            <Field label={t("What comes back")}><Input name="returnedItems" maxLength={200} /></Field>
          </div>
        </details>
      )}
      {p.exchange && <p className="rounded-xl bg-info-soft px-3 py-2 text-sm text-info sm:col-span-2">{t("Exchange: take back {item}.", { item: p.exchangeNote })}</p>}
      <div className="sm:col-span-2"><Submit>{desk ? t("Hand over") : t("Mark delivered")}</Submit></div>
    </ActionForm>
  );
}

/** How this phone number's past orders went, as counts. */
function History({ h }: { h: RecipientHistory }) {
  const risky = h.refused > 0 && h.refused * 2 >= h.orders;
  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold">{t("This recipient's past orders")}</h2>
      <p className="mt-1 text-xs text-muted">{t("Across Masar, last 12 months. Counts only: no names or shops are shared.")}</p>
      <dl className="mt-2 divide-y divide-line">
        <Row k="Delivered"><span className="tnum">{h.delivered} / {h.orders}</span></Row>
        <Row k="Refused at the door"><span className={`tnum ${h.refused ? "text-danger" : ""}`}>{h.refused}</span></Row>
        <Row k="Returned"><span className="tnum">{h.returned}</span></Row>
      </dl>
      {risky && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{t("Often refuses parcels. Consider calling before shipping.")}</p>}
    </Card>
  );
}

export function ParcelDetail({ p, session, couriers = [], bag, sms, door, returns }: { p: Parcel; session: Session; couriers?: { id: string; name: string }[]; bag?: { id: string; code: string } | null; sms?: Sms[]; door?: DoorInfo; returns?: ReturnsInfo }) {
  // Delivery goes through the hand-over form (code, partial delivery); the rest are one-click moves.
  const next = nextStatuses(p.status as Status, session.role);
  const handOver = next.includes("delivered") && (session.role === "admin" || session.role === "hub");
  const moves = next.filter((to) => to !== "delivered" || !handOver);
  const net = (p.collectedAmount ?? p.codAmount) - p.deliveryFee;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-5">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{t("Tracking number")}</p>
              <h1 className="mt-1 inline-block font-mono text-2xl font-semibold tracking-tight">{p.tracking}</h1>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={p.status} />
              <LinkButton href={`/label/${p.id}`} target="_blank" variant="ghost" size="sm"><Printer size={15} /> {t("Label")}</LinkButton>
            </div>
          </div>
          <div className="mt-7"><ProgressRail status={p.status} /></div>
        </Card>

        {p.confirmation === "pending" && p.status === "created" && (session.role === "merchant" || session.role === "admin") && <Confirmation p={p} />}

        {next.length > 0 && (
          <Card>
            <CardHeader title={t("Next step")} hint={t("Only the moves allowed from the current status are shown.")} />
            {handOver && <div className="border-b border-line p-5"><HandOver p={p} session={session} /></div>}
            <div className="flex flex-wrap gap-3 p-5">
              {moves.map((to) => {
                const needsCourier = to === "pickup_assigned" || to === "out_for_delivery";
                return (
                  <ActionForm key={to} action={transitionAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="parcelId" value={p.id} />
                    <input type="hidden" name="to" value={to} />
                    {to === "attempt_failed" && (
                      <Select name="reason" defaultValue="no_answer" aria-label={t("Reason")} className="!w-52">
                        {FAIL_REASONS.map((r) => <option key={r} value={r}>{t(REASON_TEXT[r].en)}</option>)}
                      </Select>
                    )}
                    {needsCourier && (
                      <Select name="courierId" required defaultValue={p.courierId ?? ""} aria-label={t("Courier")} className="!w-44">
                        <option value="" disabled>{t("Choose courier")}</option>
                        {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    )}
                    <Submit variant={DANGER.includes(to) ? "danger" : to === "delivered" ? "primary" : "dark"}>{t(VERB[to] ?? STATUS_LABEL[to])}</Submit>
                  </ActionForm>
                );
              })}
            </div>
          </Card>
        )}

        {door && <Door p={p} door={door} session={session} />}

        {sms && sms.length > 0 && (
          <Card>
            <CardHeader title={t("Text messages to the recipient")} />
            <ul className="divide-y divide-line">
              {sms.map((m) => (
                <li key={m.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{t(SMS_KIND[m.kind] ?? m.kind)} <span className="font-normal text-muted">· {dateTime(m.createdAt)}</span></span>
                    <Badge tone={SMS_STATUS[m.status]?.[1] ?? "neutral"}>{t(SMS_STATUS[m.status]?.[0] ?? m.status)}</Badge>
                  </div>
                  <p dir="auto" className="mt-1 text-[13px] text-ink-2">{m.body}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader title={t("History")} />
          <div className="p-5 sm:p-6"><Timeline events={p.events} showActor /></div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">{t("Recipient")}</h2>
          <dl className="mt-2 divide-y divide-line">
            <Row k="Name">{p.recipientName}</Row>
            <Row k="Phone"><span className="ltr">{p.recipientPhone}</span></Row>
            <Row k="Wilaya">{place(p.destWilaya, p.destWilayaAr)}</Row>
            <Row k="Commune">{place(p.commune, p.communeAr)}</Row>
            <Row k="Address">{p.address}</Row>
            {p.deliveryType === "desk" && p.deskHours && <Row k="Desk hours">{p.deskHours}</Row>}
            <Row k="Text messages in">{p.recipientLang === "ar" ? "العربية" : "Français"}</Row>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">{t("Money")}</h2>
          <dl className="mt-2 divide-y divide-line">
            <Row k="Cash to collect"><Money value={p.codAmount} /></Row>
            {p.collectedAmount != null && <Row k="Collected (partial)"><Money value={p.collectedAmount} /></Row>}
            <Row k="Delivery fee"><Money value={p.deliveryFee} /></Row>
            <Row k={net >= 0 ? "Merchant receives" : "Merchant pays"}><Money value={Math.abs(net)} className="text-ok" /></Row>
            <Row k="Fee if returned"><Money value={p.returnFee} /></Row>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">{t("Shipment")}</h2>
          <dl className="mt-2 divide-y divide-line">
            <Row k="Merchant">{p.merchantName}</Row>
            <Row k="Contents">{p.description || "—"}</Row>
            <Row k="Weight"><span className="ltr">{p.weightKg} kg</span></Row>
            <Row k="Destination hub">{t(p.destHub)}</Row>
            <Row k="Now at">{whereNow(p)}</Row>
            {bag && session.role !== "merchant" && (
              <Row k="Bag"><Link href={`/admin/linehaul/bags/${bag.id}`} className="font-mono text-accent-deep hover:underline">{bag.code}</Link></Row>
            )}
            {p.lengthCm && <Row k="Size"><span className="tnum">{p.lengthCm} × {p.widthCm} × {p.heightCm} cm</span></Row>}
            <Row k="Delivery">{p.deliveryType === "desk" ? t("Stop desk: {name}", { name: p.desk ?? "" }) : t("To the door")}</Row>
            {p.allowPartial && <Row k="Partial delivery">{t("Allowed")}</Row>}
            {p.exchange && <Row k="Exchange"><span dir="auto">{p.exchangeNote}</span></Row>}
            {p.confirmation !== "none" && <Row k="Confirmation">{t(CONFIRMATION[p.confirmation])}</Row>}
            {returns?.parent && (
              <Row k="Return of"><Link href={`/${session.role === "merchant" ? "merchant" : "admin"}/parcels/${returns.parent.id}`} className="font-mono text-accent-deep hover:underline">{returns.parent.tracking}</Link></Row>
            )}
            {returns?.legs.map((l) => (
              <Row key={l.id} k="Coming back as"><Link href={`/${session.role === "merchant" ? "merchant" : "admin"}/parcels/${l.id}`} className="font-mono text-accent-deep hover:underline">{l.tracking}</Link></Row>
            ))}
            <Row k="Delivery attempts">{p.attempts}</Row>
            <Row k="Created">{dateTime(p.createdAt)}</Row>
          </dl>
        </Card>
        {returns?.history && <History h={returns.history} />}
        {(session.role === "admin" || (session.role === "hub" && p.currentHubId === session.hubId)) && p.kind === "delivery" && !["delivered", "returned", "cancelled", "lost"].includes(p.status) && (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">{t("Weigh and measure")}</h2>
            <p className="mt-1 text-xs text-muted">{t("If the parcel is heavier or bigger than ordered, the fee is recalculated.")}</p>
            <ActionForm action={measureAction} className="mt-3 grid grid-cols-2 gap-3">
              <input type="hidden" name="parcelId" value={p.id} />
              <div className="col-span-2"><Field label={t("Weight (kg)")}><Input name="weightKg" inputMode="decimal" required defaultValue={p.weightKg} dir="ltr" className="tnum" /></Field></div>
              <Field label={t("Length (cm)")}><Input name="lengthCm" inputMode="numeric" defaultValue={p.lengthCm ?? ""} dir="ltr" className="tnum" /></Field>
              <Field label={t("Width (cm)")}><Input name="widthCm" inputMode="numeric" defaultValue={p.widthCm ?? ""} dir="ltr" className="tnum" /></Field>
              <Field label={t("Height (cm)")}><Input name="heightCm" inputMode="numeric" defaultValue={p.heightCm ?? ""} dir="ltr" className="tnum" /></Field>
              <div className="col-span-2"><Submit variant="dark">{t("Save")}</Submit></div>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
