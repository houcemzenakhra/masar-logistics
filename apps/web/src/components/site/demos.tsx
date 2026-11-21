"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useReduced } from "./use-reduced";
import { Check, CircleAlert, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PARCEL_KINDS, renderParcelSms, segments, type Lang, type ParcelKind } from "@/server/domain/sms-text";
import { useLocale, useT } from "../i18n-client";

/** Spreadsheet import: rows are checked one by one, the way the real import reports them. */
export function ImportDemo() {
  const t = useT();
  const reduce = useReduced();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const rows = [
    { name: "Amina Belkacem", place: "bab ezouar", fixed: "Bab Ezzouar", state: "fixed" as const },
    { name: "Yacine Haddad", place: "Es Senia", state: "ok" as const },
    { name: "Nour Ziani", place: "El Eulma", state: "ok" as const },
    { name: "Sofiane Rahmani", place: "Hydra", state: "error" as const },
    { name: "Lina Mansouri", place: "Tlemcen", state: "ok" as const },
  ];
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (reduce || !inView) return;
    const id = setTimeout(() => setDone((d) => (d >= rows.length + 4 ? 0 : d + 1)), done === 0 ? 500 : 650);
    return () => clearTimeout(id);
  }, [done, inView, reduce, rows.length]);
  const shown = reduce ? rows.length : Math.min(done, rows.length);
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[13px] text-muted">
        <span className="font-mono">orders.xlsx</span>
        <span className="tnum">{t("{n} of {total} checked", { n: shown, total: rows.length })}</span>
      </div>
      <ul className="divide-y divide-line text-sm">
        {rows.map((r, k) => {
          const seen = k < shown;
          return (
            <li key={r.name} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-5 shrink-0">
                <AnimatePresence>
                  {seen && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="block">
                      {r.state === "ok" && <Check size={17} className="text-ok" aria-label={t("Ready")} />}
                      {r.state === "fixed" && <Wand2 size={17} className="text-info" aria-label={t("Corrected")} />}
                      {r.state === "error" && <CircleAlert size={17} className="text-danger" aria-label={t("Needs a fix")} />}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="min-w-0 shrink truncate text-end text-ink-2">
                {seen && r.state === "fixed" ? (
                  <>
                    <s className="text-muted">{r.place}</s> <span className="font-medium text-info">{r.fixed}</span>
                  </>
                ) : seen && r.state === "error" ? (
                  <span className="text-danger">{t("Phone is not a mobile number")}</span>
                ) : (
                  r.place
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The real text messages, from the same templates the server sends. */
export function SmsDemo() {
  const t = useT();
  const ui = useLocale();
  const [lang, setLang] = useState<Lang>(ui === "ar" ? "ar" : "fr");
  const [kind, setKind] = useState<ParcelKind>("out_for_delivery");
  const reduce = useReduced();
  const text = renderParcelSms(kind, lang, { tracking: "MSR004512907", merchant: "Dar El Moda", merchantPhone: "0550 12 34 56", cod: 4500, courier: "Karim", courierPhone: "0770 11 22 33" }, "masar.dz");
  const seg = segments(text);
  const KIND: Record<ParcelKind, string> = { out_for_delivery: t("Out for delivery"), attempt_failed: t("Attempt failed"), delivered: t("Delivered") };
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${on ? "bg-navy text-white" : "bg-white text-ink-2 ring-1 ring-line hover:text-ink"}`;
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Message")}>
        {PARCEL_KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={pill(kind === k)}>{KIND[k]}</button>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-[#eef1f2] p-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={kind + lang}
            dir={lang === "ar" ? "rtl" : "ltr"}
            lang={lang}
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22 }}
            className={`max-w-[92%] rounded-2xl bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm ${lang === "ar" ? "ms-auto rounded-se-md" : "rounded-ss-md"}`}
          >
            {text}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5" role="group" aria-label={t("Language")}>
          <button type="button" aria-pressed={lang === "fr"} onClick={() => setLang("fr")} className={pill(lang === "fr")} lang="fr">Français</button>
          <button type="button" aria-pressed={lang === "ar"} onClick={() => setLang("ar")} className={pill(lang === "ar")} lang="ar">العربية</button>
        </div>
        <span className="tnum text-[13px] text-muted">
          {t("{n} characters, {parts} SMS", { n: seg.length, parts: seg.parts })}
        </span>
      </div>
    </div>
  );
}

/** A label, drawn small: what prints from the order page, ten to a sheet or one per sticker. */
export function LabelDemo() {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-[260px] -rotate-2 rounded-xl bg-white p-4 text-ink shadow-[0_20px_40px_-18px_rgba(12,26,38,.45)] ring-1 ring-line transition-transform duration-300 hover:rotate-0">
      <div className="flex items-center justify-between border-b border-dashed border-line pb-2">
        <span className="text-sm font-semibold">masar</span>
        <span className="rounded bg-navy px-1.5 py-0.5 text-[11px] font-medium text-white">ALG → ORN</span>
      </div>
      <div className="mt-3 flex h-11 items-end gap-[2px]" aria-hidden>
        {Array.from({ length: 38 }, (_, k) => (
          <span key={k} className="h-full bg-ink" style={{ width: (k * 5) % 3 === 0 ? 2.5 : 1.2 }} />
        ))}
      </div>
      <p className="mt-1 font-mono text-[13px]">MSR004512907</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt className="text-muted">{t("To")}</dt>
          <dd className="font-medium">Es Senia, 31</dd>
        </div>
        <div className="text-end">
          <dt className="text-muted">{t("Cash to collect")}</dt>
          <dd className="ltr font-medium">4,500 DZD</dd>
        </div>
      </dl>
    </div>
  );
}
