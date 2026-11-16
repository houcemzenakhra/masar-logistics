"use client";

import { useState } from "react";
import { INCLUDED_KG, quote, tierFor, type Tier } from "@/server/domain/pricing";
import { useLocale, useT } from "./i18n-client";

type W = { id: number; name: string; nameAr: string; zone: number };

export function RateCalculator({ wilayas, tiers }: { wilayas: W[]; tiers: Tier[] }) {
  const t = useT();
  const ar = useLocale() === "ar";
  const [from, setFrom] = useState(16);
  const [to, setTo] = useState(31);
  const [kg, setKg] = useState(2);
  const o = wilayas.find((w) => w.id === from)!;
  const d = wilayas.find((w) => w.id === to)!;
  const tier = tiers.find((x) => x.key === tierFor(o, d))!;
  const q = quote(tier, kg || 0);
  const field = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";
  const opts = wilayas.map((w) => (
    <option key={w.id} value={w.id}>
      {String(w.id).padStart(2, "0")} · {ar ? w.nameAr : w.name}
    </option>
  ));
  return (
    <div className="grid gap-6 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-8 md:grid-cols-[1fr_280px]">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[13px] font-medium text-ink-2">
          {t("From")}
          <select className={`${field} mt-1.5`} value={from} onChange={(e) => setFrom(+e.target.value)}>{opts}</select>
        </label>
        <label className="block text-[13px] font-medium text-ink-2">
          {t("To")}
          <select className={`${field} mt-1.5`} value={to} onChange={(e) => setTo(+e.target.value)}>{opts}</select>
        </label>
        <label className="block text-[13px] font-medium text-ink-2 sm:col-span-2">
          {t("Weight (kg)")}
          <input className={`${field} mt-1.5`} type="number" min={0.5} max={70} step={0.5} value={kg} onChange={(e) => setKg(+e.target.value)} />
          <span className="mt-1 block text-xs font-normal text-muted">
            {t("The first {kg} kg are included. Each extra kilo on this route is {x} DZD.", { kg: INCLUDED_KG, x: tier.perExtraKg })}
          </span>
        </label>
      </div>
      <div className="flex flex-col justify-between rounded-2xl bg-navy p-5 text-white" aria-live="polite">
        <div>
          <p className="text-sm text-white/60">{t("{tier} rate", { tier: t(tier.label) })}</p>
          <p className="tnum mt-2 text-4xl font-semibold tracking-tight">
            {new Intl.NumberFormat("en-US").format(q.deliveryFee)}
            <span className="ms-1.5 text-base font-medium text-white/60">{t("DZD")}</span>
          </p>
        </div>
        <p className="mt-6 text-[13px] text-white/60">
          {t("If the recipient refuses, the return costs {x} DZD. No delivery fee is charged on returns.", { x: q.returnFee })}
        </p>
      </div>
    </div>
  );
}
