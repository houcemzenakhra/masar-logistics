import { CalendarClock, LogOut, MapPin, MessageSquareText, Phone, Route } from "lucide-react";
import { deliverAction, logoutAction, optimiseRouteAction, transitionAction } from "@/app/actions";
import { PhotoInput } from "@/components/photo-input";
import { ActionForm, Submit } from "@/components/forms";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Input, Logo, Money, Mono, Select } from "@/components/ui";
import { money } from "@/lib/format";
import { place, t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { courierCash } from "@/server/services/ledger";
import { getDeliverySettings } from "@/server/services/delivery";
import { FAIL_REASONS, REASON_TEXT } from "@/server/services/notify";
import { listParcels, type ParcelView } from "@/server/services/parcels";

export const metadata = { title: "Run sheet" };

function Task({ p, kind, proofRequired }: { p: ParcelView; kind: "pickup" | "delivery"; proofRequired: boolean }) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {kind === "delivery" && p.routeSeq && <span className="tnum grid size-8 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold text-white" aria-label={t("Stop {n}", { n: p.routeSeq })}>{p.routeSeq}</span>}
          <div className="min-w-0">
            <p className="truncate font-semibold">{kind === "pickup" ? p.merchantName : p.recipientName}</p>
            <Mono>{p.tracking}</Mono>
          </div>
        </div>
        {kind === "delivery" && <Money value={p.codAmount} className="text-lg font-semibold" />}
      </div>
      {kind === "delivery" && (
        <>
          <p className="mt-3 flex items-start gap-2 text-sm text-ink-2"><MapPin size={16} className="mt-0.5 shrink-0 text-accent" />{p.address}, {place(p.commune, p.communeAr)}, {place(p.destWilaya, p.destWilayaAr)}</p>
          <a href={`tel:${p.recipientPhone.replaceAll(" ", "")}`} className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-info"><Phone size={15} /><span className="ltr">{p.recipientPhone}</span></a>
          {p.instructions && <p dir="auto" className="mt-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info"><MessageSquareText size={16} className="mt-0.5 shrink-0" />{p.instructions}</p>}
          {p.preferredDate && <p className="mt-2 flex items-center gap-2 text-sm text-warn"><CalendarClock size={16} />{t("Recipient asked for {day}", { day: p.preferredDate })}</p>}
        </>
      )}
      {kind === "pickup" ? (
        <ActionForm action={transitionAction} className="mt-4">
          <input type="hidden" name="parcelId" value={p.id} />
          <input type="hidden" name="to" value="picked_up" />
          <Submit variant="dark" size="lg" className="w-full">{t("Picked up")}</Submit>
        </ActionForm>
      ) : (
        <div className="mt-4 space-y-2">
          <ActionForm action={deliverAction} className="space-y-2 rounded-xl bg-paper p-3">
            <input type="hidden" name="parcelId" value={p.id} />
            <p className="text-[13px] text-ink-2">{proofRequired ? t("Proof required: the recipient's code from their text message, or a photo.") : t("Proof of delivery: the recipient's code from their text message, or a photo.")}</p>
            <div className="flex gap-2">
              <Input name="code" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" placeholder={t("4-digit code")} aria-label={t("Recipient's code")} className="!w-32 tnum" />
              <Input name="receivedBy" placeholder={t("Received by (optional)")} aria-label={t("Received by")} className="min-w-0 flex-1" />
            </div>
            <PhotoInput max={1} />
            <Submit size="lg" className="w-full">{p.codAmount > 0 ? t("Delivered · collected {x} DZD", { x: money(p.codAmount) }) : t("Delivered")}</Submit>
          </ActionForm>
          <ActionForm action={transitionAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="parcelId" value={p.id} />
            <input type="hidden" name="to" value="attempt_failed" />
            <Select name="reason" aria-label={t("Reason")} className="min-w-0 flex-1">{FAIL_REASONS.map((r) => <option key={r} value={r}>{t(REASON_TEXT[r].en)}</option>)}</Select>
            <Submit variant="danger">{t("Failed")}</Submit>
          </ActionForm>
        </div>
      )}
    </li>
  );
}

export default async function Courier() {
  const s = await requireRole("courier");
  const db = await getDb();
  const [tasks, cash, cfg] = await Promise.all([listParcels(db, { courierId: s.userId, status: ["pickup_assigned", "out_for_delivery"] }), courierCash(db, s.userId), getDeliverySettings(db)]);
  const pickups = tasks.filter((x) => x.status === "pickup_assigned");
  const deliveries = tasks.filter((x) => x.status === "out_for_delivery");
  return (
    <div className="mx-auto min-h-screen max-w-md">
      <header className="route-grid bg-navy px-5 pb-6 pt-4 text-white">
        <div className="flex items-center justify-between">
          <Logo light />
          <div className="flex items-center gap-1">
            <LocaleSwitcher dark />
            <form action={logoutAction}><button aria-label={t("Sign out")} className="rounded-lg p-2 text-white/60 hover:text-white"><LogOut size={18} className="rtl:-scale-x-100" /></button></form>
          </div>
        </div>
        <p className="mt-6 text-sm text-white/60">{s.name} · {t("cash to hand over")}</p>
        <p className="tnum mt-1 text-4xl font-semibold tracking-tight">{money(cash)} <span className="text-base font-medium text-white/60">{t("DZD")}</span></p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="tnum text-xl font-semibold">{deliveries.length}</p><p className="text-white/60">{t("to deliver")}</p></div>
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="tnum text-xl font-semibold">{pickups.length}</p><p className="text-white/60">{t("to pick up")}</p></div>
        </div>
      </header>
      <main className="space-y-8 px-4 py-6">
        {tasks.length === 0 && <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{t("Nothing assigned to you right now. New jobs appear here as soon as dispatch assigns them.")}</p>}
        {deliveries.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("Deliveries")}</h2>
              {deliveries.length > 1 && (
                <ActionForm action={optimiseRouteAction} className="flex flex-wrap justify-end">
                  <Submit size="sm" variant="ghost"><Route size={14} /> {t("Plan my route")}</Submit>
                </ActionForm>
              )}
            </div>
            <ul className="space-y-3">{deliveries.map((p) => <Task key={p.id} p={p} kind="delivery" proofRequired={cfg.proof === "required"} />)}</ul>
          </section>
        )}
        {pickups.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("Pickups")}</h2>
            <ul className="space-y-3">{pickups.map((p) => <Task key={p.id} p={p} kind="pickup" proofRequired={false} />)}</ul>
          </section>
        )}
      </main>
    </div>
  );
}
