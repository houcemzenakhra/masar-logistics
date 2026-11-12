import { LogOut, MapPin, Phone } from "lucide-react";
import { logoutAction, transitionAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Logo, Mono, Money, Select } from "@/components/ui";
import { money } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { courierCash } from "@/server/services/ledger";
import { listParcels, type ParcelView } from "@/server/services/parcels";

export const metadata = { title: "Run sheet" };

const REASONS = ["Recipient not answering", "Recipient absent", "Refused the parcel", "Wrong address", "Asked to reschedule"];

function Task({ p, kind }: { p: ParcelView; kind: "pickup" | "delivery" }) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{kind === "pickup" ? p.merchantName : p.recipientName}</p>
          <Mono>{p.tracking}</Mono>
        </div>
        {kind === "delivery" && <Money value={p.codAmount} className="text-lg font-semibold" />}
      </div>
      {kind === "delivery" && (
        <>
          <p className="mt-3 flex items-start gap-2 text-sm text-ink-2"><MapPin size={16} className="mt-0.5 shrink-0 text-accent" />{p.address}, {p.commune}, {p.destWilaya}</p>
          <a href={`tel:${p.recipientPhone.replaceAll(" ", "")}`} className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-info"><Phone size={15} />{p.recipientPhone}</a>
        </>
      )}
      {kind === "pickup" ? (
        <ActionForm action={transitionAction} className="mt-4">
          <input type="hidden" name="parcelId" value={p.id} />
          <input type="hidden" name="to" value="picked_up" />
          <Submit variant="dark" size="lg" className="w-full">Picked up</Submit>
        </ActionForm>
      ) : (
        <div className="mt-4 space-y-2">
          <ActionForm action={transitionAction}>
            <input type="hidden" name="parcelId" value={p.id} />
            <input type="hidden" name="to" value="delivered" />
            <Submit size="lg" className="w-full">{p.codAmount > 0 ? `Delivered · collected ${money(p.codAmount)} DZD` : "Delivered"}</Submit>
          </ActionForm>
          <ActionForm action={transitionAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="parcelId" value={p.id} />
            <input type="hidden" name="to" value="attempt_failed" />
            <Select name="note" aria-label="Reason" className="min-w-0 flex-1">{REASONS.map((r) => <option key={r}>{r}</option>)}</Select>
            <Submit variant="danger">Failed</Submit>
          </ActionForm>
        </div>
      )}
    </li>
  );
}

export default async function Courier() {
  const s = await requireRole("courier");
  const db = await getDb();
  const [tasks, cash] = await Promise.all([listParcels(db, { courierId: s.userId, status: ["pickup_assigned", "out_for_delivery"] }), courierCash(db, s.userId)]);
  const pickups = tasks.filter((t) => t.status === "pickup_assigned");
  const deliveries = tasks.filter((t) => t.status === "out_for_delivery");
  return (
    <div className="mx-auto min-h-screen max-w-md">
      <header className="route-grid bg-navy px-5 pb-6 pt-4 text-white">
        <div className="flex items-center justify-between">
          <Logo light />
          <form action={logoutAction}><button aria-label="Sign out" className="rounded-lg p-2 text-white/60 hover:text-white"><LogOut size={18} /></button></form>
        </div>
        <p className="mt-6 text-sm text-white/60">{s.name} · cash to hand over</p>
        <p className="tnum mt-1 text-4xl font-semibold tracking-tight">{money(cash)} <span className="text-base font-medium text-white/60">DZD</span></p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="tnum text-xl font-semibold">{deliveries.length}</p><p className="text-white/60">to deliver</p></div>
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="tnum text-xl font-semibold">{pickups.length}</p><p className="text-white/60">to pick up</p></div>
        </div>
      </header>
      <main className="space-y-8 px-4 py-6">
        {tasks.length === 0 && <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">Nothing assigned to you right now. New jobs appear here as soon as dispatch assigns them.</p>}
        {deliveries.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Deliveries</h2>
            <ul className="space-y-3">{deliveries.map((p) => <Task key={p.id} p={p} kind="delivery" />)}</ul>
          </section>
        )}
        {pickups.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Pickups</h2>
            <ul className="space-y-3">{pickups.map((p) => <Task key={p.id} p={p} kind="pickup" />)}</ul>
          </section>
        )}
      </main>
    </div>
  );
}
