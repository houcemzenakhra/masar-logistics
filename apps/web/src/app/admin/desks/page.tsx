import { Building2 } from "lucide-react";
import Link from "next/link";
import { createDeskAction, deliverAction, deskActiveAction, returnsSettingsAction, transitionAction } from "@/app/actions";
import { CommuneSelect } from "@/components/commune-select";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { place, t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getDeskSettings, listDesks, MIN_DESK_FEE } from "@/server/services/desks";
import { listHubs, listWilayas } from "@/server/services/directory";
import { listParcels, type ParcelView } from "@/server/services/parcels";
import { DESK_HOLD_DAYS } from "@/server/services/sms";

const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400_000);

/**
 * Stop desks. Hub teams run their counter here: shelve parcels that arrived for the desk, hand
 * them over against the recipient's code, and send back what nobody collected. Operations also
 * open and close desks and set the discount.
 */
export default async function Desks({ searchParams }: { searchParams: Promise<{ hub?: string }> }) {
  const s = await requireRole("admin", "hub");
  const db = await getDb();
  const hubs = await listHubs(db);
  const hubId = s.role === "hub" ? s.hubId! : ((await searchParams).hub ?? hubs[0]?.id);
  const hub = hubs.find((h) => h.id === hubId);
  const [parcels, desks, wilayas, cfg] = await Promise.all([
    listParcels(db, { deskHubId: hubId, status: ["at_origin_hub", "at_destination_hub", "ready_for_pickup"], limit: 300 }),
    listDesks(db, s.role === "hub" ? { hubId } : {}),
    s.role === "admin" ? listWilayas(db) : Promise.resolve([]),
    getDeskSettings(db),
  ]);
  const toShelve = parcels.filter((p) => p.status === "at_destination_hub" || (p.status === "at_origin_hub" && p.originHubId === p.destHubId && !p.bagId));
  const onShelf = parcels.filter((p) => p.status === "ready_for_pickup").sort((a, b) => +a.updatedAt - +b.updatedAt);
  const chip = (on: boolean) => `whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset ${on ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line hover:bg-paper"}`;

  return (
    <>
      <PageHeader title={t("Stop desks")} subtitle={t("Recipients collect their parcels at the counter with the code from their text message. Uncollected parcels go back after {n} days.", { n: DESK_HOLD_DAYS })} />
      {s.role === "admin" && (
        <nav className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t("Hub")}>
          {hubs.map((h) => <Link key={h.id} href={`/admin/desks?hub=${h.id}`} className={chip(h.id === hubId)}>{t(h.name)}</Link>)}
        </nav>
      )}

      <div className="grid gap-5">
        <Card className="min-w-0">
          <CardHeader title={t("Arrived for the desk")} hint={hub ? t("At {hub}. Put each one on the shelf: the recipient is told it is ready.", { hub: t(hub.name) }) : undefined} />
          <Table head={["Parcel", "Desk", "Cash to collect", ""]} empty={toShelve.length === 0}>
            {toShelve.map((p) => (
              <tr key={p.id}>
                <Td><ParcelCell p={p} /></Td>
                <Td className="text-[13px]">{p.desk}</Td>
                <Td className="tnum">{p.codAmount.toLocaleString("fr-DZ")}</Td>
                <Td className="text-end">
                  <ActionForm action={transitionAction}>
                    <input type="hidden" name="parcelId" value={p.id} />
                    <input type="hidden" name="to" value="ready_for_pickup" />
                    <Submit size="sm" variant="dark">{t("Put on shelf")}</Submit>
                  </ActionForm>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card className="min-w-0">
          <CardHeader title={t("On the shelf")} hint={t("Waiting for their recipient: {n}", { n: onShelf.length })} />
          <Table head={["Parcel", "Waiting", "Cash to collect", ""]} empty={onShelf.length === 0}>
            {onShelf.map((p) => {
              const days = daysSince(p.updatedAt);
              const late = days >= DESK_HOLD_DAYS;
              return (
                <tr key={p.id}>
                  <Td><ParcelCell p={p} /></Td>
                  <Td>{late ? <Badge tone="danger">{t("{n} days", { n: days })}</Badge> : <span className="text-[13px] text-muted">{days === 0 ? t("Today") : t("{n} days", { n: days })}</span>}</Td>
                  <Td className="tnum">{p.codAmount.toLocaleString("fr-DZ")}</Td>
                  <Td className="text-end">
                    {late ? (
                      <ActionForm action={transitionAction}>
                        <input type="hidden" name="parcelId" value={p.id} />
                        <input type="hidden" name="to" value="return_initiated" />
                        <input type="hidden" name="note" value={`Not collected at the stop desk within ${DESK_HOLD_DAYS} days`} />
                        <Submit size="sm" variant="danger">{t("Send back")}</Submit>
                      </ActionForm>
                    ) : (
                      <ActionForm action={deliverAction} className="flex items-center justify-end gap-2">
                        <input type="hidden" name="parcelId" value={p.id} />
                        <Input name="code" required inputMode="numeric" maxLength={4} placeholder={t("Code")} aria-label={t("Code from the recipient's text message")} dir="ltr" className="!h-9 !w-20 tnum" />
                        <Submit size="sm">{t("Hand over")}</Submit>
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>

      <Card className="mt-5 min-w-0">
        <CardHeader title={s.role === "admin" ? t("All stop desks") : t("Your stop desks")} hint={t("{n} open", { n: desks.filter((d) => d.active).length })} />
        <Table head={["Desk", "Wilaya", "Address", "Hours", "Hub", ""]} empty={desks.length === 0}>
          {desks.map((d) => (
            <tr key={d.id} className={d.active ? "" : "opacity-60"}>
              <Td>
                <span className="flex items-center gap-2 font-medium"><Building2 size={15} className="text-muted" /> {d.name}</span>
                <span className="font-mono text-xs text-muted">{d.code}</span>
              </Td>
              <Td className="text-[13px]">{place(d.wilaya, d.wilayaAr)}{d.commune ? ` · ${place(d.commune, d.communeAr ?? d.commune)}` : ""}</Td>
              <Td className="max-w-56 text-[13px]">{d.address}{d.phone && <span className="ltr block text-muted">{d.phone}</span>}</Td>
              <Td className="text-[13px]">{d.hours || "—"}</Td>
              <Td className="text-[13px]">{t(d.hub)}</Td>
              <Td className="text-end">
                {s.role === "admin" ? (
                  <ActionForm action={deskActiveAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="active" value={d.active ? "0" : "1"} />
                    <Submit size="sm" variant="ghost">{d.active ? t("Close") : t("Reopen")}</Submit>
                  </ActionForm>
                ) : (
                  <Badge tone={d.active ? "success" : "neutral"}>{d.active ? t("Open") : t("Closed")}</Badge>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {s.role === "admin" && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader title={t("Open a stop desk")} hint={t("It is run by the hub that serves the wilaya.")} />
            <ActionForm action={createDeskAction} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label={t("Name")}><Input name="name" required placeholder="Masar Bab Ezzouar" /></Field>
              <Field label={t("Phone (optional)")}><Input name="phone" inputMode="tel" dir="ltr" /></Field>
              <CommuneSelect wilayas={wilayas} />
              <div className="sm:col-span-2"><Field label={t("Address")} hint={t("As recipients will read it in the text message.")}><Input name="address" required /></Field></div>
              <Field label={t("Opening hours")}><Input name="hours" maxLength={60} placeholder="Sam-Jeu 9:00-18:00" /></Field>
              <div className="flex items-end"><Submit>{t("Open desk")}</Submit></div>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title={t("Price")} hint={t("Collecting at a desk costs less than delivery to the door.")} />
            <ActionForm action={returnsSettingsAction} className="space-y-4 p-5">
              <Field label={t("Discount on the delivery fee (DZD)")} hint={t("A desk delivery never costs less than {min} DZD.", { min: MIN_DESK_FEE })}>
                <Input name="discount" type="number" min={0} max={2000} required defaultValue={cfg.discount} dir="ltr" className="tnum" />
              </Field>
              <Submit>{t("Save")}</Submit>
            </ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}

function ParcelCell({ p }: { p: ParcelView }) {
  return (
    <>
      <Link href={`/admin/parcels/${p.id}`} className="font-mono text-[13px] text-accent-deep hover:underline">{p.tracking}</Link>
      <span className="block text-[13px]">{p.recipientName} <span className="ltr text-muted">{p.recipientPhone}</span></span>
      <span className="block text-xs text-muted">{dateTime(p.updatedAt)}</span>
    </>
  );
}
