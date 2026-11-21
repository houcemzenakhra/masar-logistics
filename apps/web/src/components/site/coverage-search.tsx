"use client";

import { AnimatePresence, motion } from "motion/react";
import { useReduced } from "./use-reduced";
import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { INCLUDED_KG, quote, tierFor, type Tier } from "@/server/domain/pricing";
import type { CommuneHit } from "@/server/services/directory";
import { useLocale, useT } from "../i18n-client";

type W = { id: number; name: string; nameAr: string; zone: number };
const ZONE_DOT = ["", "bg-zone-north", "bg-zone-high", "bg-zone-south"];

/** Type a commune, see which hub serves it and what delivery costs from your wilaya. */
export function CoverageSearch({ wilayas, tiers, compact = false }: { wilayas: W[]; tiers: Tier[]; compact?: boolean }) {
  const t = useT();
  const ar = useLocale() === "ar";
  const reduce = useReduced();
  const id = useId();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(16);
  const [found, setHits] = useState<CommuneHit[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v1/communes?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((d) => {
          setHits(d.communes);
          setFailed(false);
        })
        .catch((e) => e?.name !== "AbortError" && setFailed(true));
    }, 180);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q]);

  const hits = q.trim().length < 2 ? null : found;
  const origin = wilayas.find((w) => w.id === from)!;
  const ZONE = ["", t("North"), t("Highlands"), t("South")];
  const field = "h-12 w-full rounded-xl border border-line bg-white px-3 text-[15px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <label className="relative block">
          <span className="sr-only">{t("Commune")}</span>
          <Search size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search a commune, e.g. Bab Ezzouar or سطيف")}
            className={`${field} ps-10`}
            aria-describedby={`${id}-hint`}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="sr-only">{t("Shipping from")}</span>
          <select value={from} onChange={(e) => setFrom(+e.target.value)} className={field} aria-label={t("Shipping from")}>
            {wilayas.map((w) => (
              <option key={w.id} value={w.id}>
                {t("From {place}", { place: `${String(w.id).padStart(2, "0")} ${ar ? w.nameAr : w.name}` })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p id={`${id}-hint`} className="mt-2 text-[13px] text-muted">
        {t("Prices are for parcels up to {kg} kg.", { kg: INCLUDED_KG })}
      </p>
      <div className={`mt-4 ${compact ? "min-h-[200px]" : "min-h-[280px]"}`} aria-live="polite">
        {failed && <p className="text-sm text-danger">{t("Search is not available right now. Try again in a moment.")}</p>}
        {hits && hits.length === 0 && !failed && <p className="text-sm text-ink-2">{t("No commune matches “{q}”. Check the spelling, or search the wilaya name.", { q })}</p>}
        {!hits && !failed && <p className="text-sm text-muted">{t("Start typing: every one of the 1,541 communes is served.")}</p>}
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line empty:hidden">
          <AnimatePresence initial={false}>
            {hits?.slice(0, compact ? 5 : 12).map((h) => {
              const tier = tiers.find((x) => x.key === tierFor(origin, { id: h.wilayaId, zone: h.zone }))!;
              return (
                <motion.li
                  key={h.id}
                  layout={!reduce}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{ar ? h.nameAr : h.name}</p>
                    <p className="text-[13px] text-muted">
                      {String(h.wilayaId).padStart(2, "0")} {ar ? h.wilayaAr : h.wilaya}, {t(h.hub)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                    <span className={`size-2 rounded-full ${ZONE_DOT[h.zone]}`} aria-hidden />
                    {from === h.wilayaId ? t("Same wilaya") : ZONE[h.zone]}
                  </span>
                  <span className="tnum w-24 text-end font-medium">
                    {new Intl.NumberFormat("en-US").format(quote(tier, 1).deliveryFee)} {t("DZD")}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
