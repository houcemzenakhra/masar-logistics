"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "./i18n-client";

type Place = { id: number; name: string; nameAr: string };

const FIELD = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-paper disabled:text-muted";

/** Wilaya and commune pickers. The commune list is loaded from the directory when a wilaya is chosen. */
export function CommuneSelect({ wilayas, wilayaField = "destWilayaId", communeField = "communeId" }: { wilayas: Place[]; wilayaField?: string; communeField?: string }) {
  const t = useT();
  const ar = useLocale() === "ar";
  const [wilaya, setWilaya] = useState("");
  const [communes, setCommunes] = useState<Place[] | null>(null);
  const [failed, setFailed] = useState(false);
  const label = (p: Place) => (ar ? p.nameAr : p.name);

  useEffect(() => {
    if (!wilaya) return;
    let live = true;
    fetch(`/api/v1/wilayas/${wilaya}/communes`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && (setCommunes(d.communes), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [wilaya]);

  return (
    <>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{t("Wilaya")}</span>
        <select
          name={wilayaField}
          required
          value={wilaya}
          onChange={(e) => {
            setCommunes(null);
            setWilaya(e.target.value);
          }}
          className={FIELD}
        >
          <option value="" disabled>{t("Choose wilaya")}</option>
          {wilayas.map((w) => (
            <option key={w.id} value={w.id}>{String(w.id).padStart(2, "0")} · {label(w)}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{t("Commune")}</span>
        <select name={communeField} required defaultValue="" key={wilaya} disabled={!communes} className={FIELD}>
          <option value="" disabled>{!wilaya ? t("Choose the wilaya first") : communes ? t("Choose commune") : t("Loading…")}</option>
          {communes?.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
        </select>
        {failed && <span role="alert" className="mt-1 block text-xs text-danger">{t("Could not load the communes. Check your connection and choose the wilaya again.")}</span>}
      </label>
    </>
  );
}
