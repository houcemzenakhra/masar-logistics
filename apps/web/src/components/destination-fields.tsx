"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "./i18n-client";

type Place = { id: number; name: string; nameAr: string };
type Desk = { id: string; name: string; address: string; hours: string; commune: string | null; communeAr: string | null };

const FIELD = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-paper disabled:text-muted";
const LABEL = "mb-1.5 block text-[13px] font-medium text-ink-2";

function useList<T>(url: string | null, key: string) {
  const [state, setState] = useState<{ url: string; items: T[] | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setState({ url, items: d[key], failed: false }))
      .catch(() => live && setState({ url, items: null, failed: true }));
    return () => {
      live = false;
    };
  }, [url, key]);
  const current = state?.url === url ? state : null;
  return { items: current?.items ?? null, failed: !!current?.failed };
}

/**
 * Where the parcel goes: to the door (wilaya, commune, address) or to a stop desk in the wilaya,
 * which costs less. Desks are offered only where the network has one.
 */
export function DestinationFields({ wilayas, deskDiscount }: { wilayas: Place[]; deskDiscount: number }) {
  const t = useT();
  const ar = useLocale() === "ar";
  const [wilaya, setWilaya] = useState("");
  const [type, setType] = useState<"home" | "desk">("home");
  const communes = useList<Place>(wilaya && type === "home" ? `/api/v1/wilayas/${wilaya}/communes` : null, "communes");
  const desks = useList<Desk>(wilaya ? `/api/v1/desks?wilaya=${wilaya}` : null, "desks");
  const label = (p: Place) => (ar ? p.nameAr : p.name);
  const noDesk = !!wilaya && desks.items !== null && desks.items.length === 0;
  const mode = type === "desk" && noDesk ? "home" : type;
  const tab = (on: boolean) => `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${on ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`;

  return (
    <>
      <div className="sm:col-span-2">
        <span className={LABEL}>{t("Delivery")}</span>
        <input type="hidden" name="deliveryType" value={mode} />
        <div role="radiogroup" className="flex gap-1 rounded-xl bg-paper p-1 ring-1 ring-inset ring-line">
          <button type="button" role="radio" aria-checked={mode === "home"} onClick={() => setType("home")} className={tab(mode === "home")}>
            {t("To the door")}
          </button>
          <button type="button" role="radio" aria-checked={mode === "desk"} onClick={() => setType("desk")} disabled={noDesk} className={`${tab(mode === "desk")} disabled:opacity-50`}>
            {t("Stop desk")}
            {deskDiscount > 0 && <span className="ms-1.5 text-xs font-normal text-success">−{deskDiscount} {t("DZD")}</span>}
          </button>
        </div>
        {noDesk && type === "desk" && <span className="mt-1 block text-xs text-muted">{t("No stop desk in this wilaya yet: delivery to the door.")}</span>}
      </div>

      <label className="block">
        <span className={LABEL}>{t("Wilaya")}</span>
        <select name="destWilayaId" required value={wilaya} onChange={(e) => setWilaya(e.target.value)} className={FIELD}>
          <option value="" disabled>{t("Choose wilaya")}</option>
          {wilayas.map((w) => (
            <option key={w.id} value={w.id}>{String(w.id).padStart(2, "0")} · {label(w)}</option>
          ))}
        </select>
      </label>

      {mode === "home" ? (
        <>
          <label className="block">
            <span className={LABEL}>{t("Commune")}</span>
            <select name="communeId" required defaultValue="" key={wilaya} disabled={!communes.items} className={FIELD}>
              <option value="" disabled>{!wilaya ? t("Choose the wilaya first") : communes.items ? t("Choose commune") : t("Loading…")}</option>
              {communes.items?.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
            </select>
            {communes.failed && <span role="alert" className="mt-1 block text-xs text-danger">{t("Could not load the communes. Check your connection and choose the wilaya again.")}</span>}
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL}>{t("Address")}</span>
            <input name="address" required className={FIELD} />
            <span className="mt-1 block text-xs text-muted">{t("Street, building, or a landmark the courier can find.")}</span>
          </label>
        </>
      ) : (
        <label className="block">
          <span className={LABEL}>{t("Stop desk")}</span>
          <select name="stopDeskId" required defaultValue="" key={wilaya} disabled={!desks.items} className={FIELD}>
            <option value="" disabled>{!wilaya ? t("Choose the wilaya first") : desks.items ? t("Choose the stop desk") : t("Loading…")}</option>
            {desks.items?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.commune ? ` · ${ar ? d.communeAr : d.commune}` : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">{t("The recipient gets a text message with the address, opening hours and a code when it arrives.")}</span>
        </label>
      )}
    </>
  );
}

/** Partial delivery and exchange, both optional. */
export function OrderOptions() {
  const t = useT();
  const [exchange, setExchange] = useState(false);
  const box = "mt-0.5 size-4 shrink-0 accent-accent";
  return (
    <fieldset className="grid gap-3 rounded-xl bg-paper p-4 ring-1 ring-inset ring-line sm:col-span-2">
      <legend className="sr-only">{t("Options")}</legend>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="allowPartial" className={box} />
        <span className="text-sm">
          <span className="font-medium">{t("Allow partial delivery")}</span>
          <span className="block text-muted">{t("The recipient may keep only some items and pay for those. The rest comes back to you, with the return fee.")}</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="exchange" checked={exchange} onChange={(e) => setExchange(e.target.checked)} className={box} />
        <span className="text-sm">
          <span className="font-medium">{t("Exchange")}</span>
          <span className="block text-muted">{t("The courier collects an item from the recipient on delivery and brings it back to you, with the return fee.")}</span>
        </span>
      </label>
      {exchange && (
        <label className="block ps-7">
          <span className={LABEL}>{t("Item to collect")}</span>
          <input name="exchangeNote" required maxLength={200} placeholder={t("e.g. Black shoes, size 42")} className={FIELD} />
        </label>
      )}
    </fieldset>
  );
}
