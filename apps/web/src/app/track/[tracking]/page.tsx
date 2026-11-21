import { CalendarDays, MapPin, MessageSquareText, PackageSearch, ShieldCheck, Store } from "lucide-react";
import { recipientConfirmAction, recipientInstructionsAction, recipientRateAction, recipientRescheduleAction, recipientVerifyAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { StarInput } from "@/components/star-input";
import { TrackLive } from "@/components/track-live";
import { Input, Select } from "@/components/ui";
import { recipientParcelId } from "@/lib/recipient";
import { isTerminal, type Status } from "@/server/domain/state";
import { rescheduleDays } from "@/server/services/recipient";
import { SiteFooter, SiteNav, TrackForm } from "@/components/site";
import { ProgressRail, Timeline } from "@/components/tracking";
import { Card, StatusBadge } from "@/components/ui";
import { ago, dateOnly, money } from "@/lib/format";
import { initLocale, place, t } from "@/lib/i18n";
import { getDb } from "@/server/db";
import { getParcel } from "@/server/services/parcels";

export const metadata = { title: "Tracking" };

export default async function Track({ params }: { params: Promise<{ tracking: string }> }) {
  await initLocale();
  const tracking = decodeURIComponent((await params).tracking);
  const p = await getParcel(await getDb(), { tracking });
  const unlocked = p ? (await recipientParcelId(p.tracking)) === p.id : false;
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 sm:mb-8"><TrackForm defaultValue={tracking} /></div>
        {!p ? (
          <Card className="p-8 text-center sm:p-10">
            <PackageSearch className="mx-auto text-muted" size={36} />
            <h1 className="mt-4 text-xl font-semibold">{t("We can't find {x}", { x: tracking })}</h1>
            <p className="mt-2 text-ink-2">{t("Check the number on your label. Masar tracking numbers start with MSR followed by nine digits.")}</p>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">{t("Tracking number")}</p>
                  <h1 className="mt-1 inline-block font-mono text-2xl font-semibold tracking-tight">{p.tracking}</h1>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-8"><ProgressRail status={p.status} /></div>
              <div className="mt-8 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted">{t("Destination")}</p>
                  <p className="mt-1 flex items-center gap-1.5 font-medium"><MapPin size={15} className="shrink-0 text-accent" />{place(p.commune, p.communeAr)}, {place(p.destWilaya, p.destWilayaAr)}</p>
                </div>
                <div>
                  <p className="text-muted">{t("Sent by")}</p>
                  <p className="mt-1 font-medium">{p.merchantName}</p>
                </div>
                <div>
                  <p className="text-muted">{t("Last update")}</p>
                  <p className="mt-1 font-medium">{ago(p.updatedAt)}</p>
                </div>
              </div>
              {p.deliveryType === "desk" && p.desk && !isTerminal(p.status as Status) && (
                <div className="mt-5 flex gap-3 rounded-xl bg-paper px-4 py-3 text-sm ring-1 ring-inset ring-line">
                  <Store size={18} className="mt-0.5 shrink-0 text-accent" />
                  <div>
                    <p className="font-medium">{p.status === "ready_for_pickup" ? t("Ready to collect at {desk}", { desk: p.desk }) : t("To collect at {desk}", { desk: p.desk })}</p>
                    <p dir="auto" className="text-ink-2">{p.deskAddress}</p>
                    {p.deskHours && <p dir="auto" className="text-ink-2">{p.deskHours}</p>}
                    {p.status === "ready_for_pickup" && (
                      <p className="mt-1 text-ink-2">
                        {p.codAmount > 0 ? t("Bring the code from your text message and {x} DZD.", { x: money(p.codAmount) }) : t("Bring the code from your text message.")}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {p.status === "out_for_delivery" && p.codAmount > 0 && (
                <p className="mt-5 rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent-deep">
                  {t("Please have {x} DZD ready for the courier.", { x: money(p.codAmount) })}
                </p>
              )}
            </Card>
            {p.status === "out_for_delivery" && <TrackLive tracking={p.tracking} dest={p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null} />}
            <Manage p={p} unlocked={unlocked} />
            <Card className="p-5 sm:p-6">
              <h2 className="mb-5 text-[15px] font-semibold">{t("History")}</h2>
              {/* Recipients see where the parcel was, not who handled it or internal notes. */}
              <Timeline events={p.events.map((e) => ({ ...e, note: "", actor: null }))} />
            </Card>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

type P = NonNullable<Awaited<ReturnType<typeof getParcel>>>;

/** Recipient self-service: unlocked with the last four digits of the phone number on the parcel. */
function Manage({ p, unlocked }: { p: P; unlocked: boolean }) {
  const confirm = p.confirmation === "pending" && p.status === "created";
  // Another day and directions are for a courier coming to the door.
  const open = !isTerminal(p.status as Status) && p.status !== "return_initiated" && p.deliveryType === "home" && !confirm;
  const canRate = p.status === "delivered" && p.rating == null;
  if (p.status === "delivered" && p.rating != null && unlocked) {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold">{t("Thank you for your rating.")}</h2>
        <p className="mt-1 text-sm text-ink-2">{t("You gave this delivery {n} out of 5.", { n: p.rating })}</p>
      </Card>
    );
  }
  if (!open && !canRate && !confirm) return null;
  if (!unlocked) {
    return (
      <Card className={`p-5 sm:p-6 ${confirm ? "ring-2 ring-accent/40" : ""}`}>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck size={17} className="text-accent" />{confirm ? t("Confirm your order from {shop}", { shop: p.merchantName }) : open ? t("Is this parcel for you?") : t("How was your delivery?")}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {confirm
            ? t("It is shipped once you confirm. First enter the last four digits of your phone number.")
            : open
              ? t("Choose another day or leave directions for the courier. First confirm the last four digits of your phone number.")
              : t("Rate the delivery. First confirm the last four digits of your phone number.")}
        </p>
        <ActionForm action={recipientVerifyAction} className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="tracking" value={p.tracking} />
          <Input name="last4" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" required placeholder="1234" aria-label={t("Last four digits of your phone number")} className="!w-32 tnum" />
          <Submit variant="dark">{t("Confirm")}</Submit>
        </ActionForm>
      </Card>
    );
  }
  if (confirm) {
    return (
      <Card className="p-5 sm:p-6 ring-2 ring-accent/40">
        <h2 className="text-[15px] font-semibold">{t("Confirm your order from {shop}", { shop: p.merchantName })}</h2>
        <dl className="mt-3 grid gap-1 text-sm">
          {p.description && <div className="flex gap-2"><dt className="text-muted">{t("Contents")}:</dt><dd dir="auto">{p.description}</dd></div>}
          <div className="flex gap-2"><dt className="text-muted">{t("To pay on delivery")}:</dt><dd className="font-medium">{money(p.codAmount)} {t("DZD")}</dd></div>
          <div className="flex gap-2"><dt className="text-muted">{t("Delivery")}:</dt><dd>{p.deliveryType === "desk" ? t("Stop desk: {name}", { name: p.desk ?? "" }) : p.address}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionForm action={recipientConfirmAction}>
            <input type="hidden" name="tracking" value={p.tracking} />
            <input type="hidden" name="answer" value="yes" />
            <Submit>{t("Yes, send it")}</Submit>
          </ActionForm>
          <ActionForm action={recipientConfirmAction}>
            <input type="hidden" name="tracking" value={p.tracking} />
            <input type="hidden" name="answer" value="no" />
            <Submit variant="ghost">{t("No, cancel the order")}</Submit>
          </ActionForm>
        </div>
      </Card>
    );
  }
  const days = rescheduleDays();
  return (
    <Card className="divide-y divide-line">
      {open && (
        <ActionForm action={recipientRescheduleAction} className="p-5 sm:p-6">
          <input type="hidden" name="tracking" value={p.tracking} />
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><CalendarDays size={17} className="text-accent" />{t("Choose another day")}</h2>
          <p className="mt-1 text-sm text-ink-2">{p.preferredDate ? t("You asked for {day}.", { day: dateOnly(p.preferredDate) }) : t("Not at home? Pick a day in the coming week.")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Select name="day" defaultValue={p.preferredDate ?? days[0]} aria-label={t("Day")} className="!w-56">
              {days.map((d) => <option key={d} value={d}>{dateOnly(d)}</option>)}
            </Select>
            <Submit variant="dark">{t("Save the day")}</Submit>
          </div>
        </ActionForm>
      )}
      {open && (
        <ActionForm action={recipientInstructionsAction} className="p-5 sm:p-6">
          <input type="hidden" name="tracking" value={p.tracking} />
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><MessageSquareText size={17} className="text-accent" />{t("Directions for the courier")}</h2>
          <textarea name="instructions" dir="auto" maxLength={200} rows={2} defaultValue={p.instructions} placeholder={t("e.g. Call when outside, building B, 3rd floor")} className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" />
          <Submit variant="dark">{t("Save directions")}</Submit>
        </ActionForm>
      )}
      {canRate && (
        <ActionForm action={recipientRateAction} className="p-5 sm:p-6">
          <input type="hidden" name="tracking" value={p.tracking} />
          <h2 className="text-[15px] font-semibold">{t("How was your delivery?")}</h2>
          <div className="mt-3"><StarInput /></div>
          <textarea name="comment" dir="auto" maxLength={300} rows={2} placeholder={t("Anything to add? (optional)")} className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" />
          <Submit variant="dark">{t("Send rating")}</Submit>
        </ActionForm>
      )}
    </Card>
  );
}
