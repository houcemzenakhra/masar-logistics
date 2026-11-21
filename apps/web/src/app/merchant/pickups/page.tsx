import { eq } from "drizzle-orm";
import { bookPickupAction, cancelPickupAction, pickupDaysAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { dayName } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { merchants } from "@/server/schema";
import { WORK_DAYS, bookableDays, parseDays, upcomingPickups } from "@/server/services/pickups";

const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WINDOW = { morning: "Morning (8:00 to 12:00)", afternoon: "Afternoon (13:00 to 17:00)" } as const;

/** When couriers come for the merchant's orders: regular days, and extra days booked ahead. */
export default async function Pickups() {
  const s = await requireRole("merchant");
  const db = await getDb();
  const [[m], upcoming] = await Promise.all([db.select({ days: merchants.pickupDays }).from(merchants).where(eq(merchants.id, s.merchantId!)), upcomingPickups(db, s.merchantId!)]);
  const days = parseDays(m.days);
  const bookable = bookableDays();

  return (
    <>
      <PageHeader title={t("Pickups")} subtitle={t("When a courier comes for your orders.")} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("Regular days")} hint={t("Tick the days a courier should come. With none ticked, a courier comes every day you have new orders.")} />
          <ActionForm action={pickupDaysAction} className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {WORK_DAYS.map((d) => (
                <label key={d} className="cursor-pointer">
                  <input type="checkbox" name="days" value={d} defaultChecked={days.includes(d)} className="peer sr-only" />
                  <span className="inline-block rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset ring-line transition-colors peer-checked:bg-navy peer-checked:text-white peer-checked:ring-navy peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{t(DAY_NAME[d])}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">{t("No pickups on Fridays.")}</p>
            <Submit>{t("Save")}</Submit>
          </ActionForm>
        </Card>

        <Card>
          <CardHeader title={t("Book a pickup")} hint={t("For a day outside your regular days, or to tell the courier what to expect. Today is possible until noon.")} />
          <ActionForm action={bookPickupAction} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label={t("Day")}>
              <Select name="day" required defaultValue={bookable[0]}>
                {bookable.map((d) => <option key={d} value={d}>{dayName(d)}</option>)}
              </Select>
            </Field>
            <Field label={t("Time")}>
              <Select name="window" defaultValue="morning">
                {Object.entries(WINDOW).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
              </Select>
            </Field>
            <Field label={t("Parcels to hand over (about)")}><Input name="expected" type="number" min={0} max={999} dir="ltr" className="tnum" /></Field>
            <Field label={t("Note for the courier (optional)")}><Input name="note" maxLength={200} placeholder={t("e.g. Ring at the back door")} /></Field>
            <div className="sm:col-span-2"><Submit>{t("Book")}</Submit></div>
          </ActionForm>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title={t("Booked")} />
        {upcoming.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("Nothing booked.")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="font-medium">{dayName(p.day)} · {t(WINDOW[p.window])}</p>
                  <p className="text-sm text-muted">
                    {p.expected > 0 && t("About {n} parcels", { n: p.expected })}
                    {p.expected > 0 && p.note && " · "}
                    {p.note}
                  </p>
                </div>
                <ActionForm action={cancelPickupAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <Submit size="sm" variant="ghost">{t("Cancel")}</Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
