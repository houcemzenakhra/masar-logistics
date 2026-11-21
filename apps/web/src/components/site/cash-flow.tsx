"use client";

import { motion, useInView } from "motion/react";
import { useReduced } from "./use-reduced";
import { RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { useT } from "../i18n-client";

/**
 * Where cash on delivery goes, as the ledger records it: each move is one balanced entry,
 * so the books always add up to zero. Example: a 4,500 DZD order on the north rate.
 */
export function CashFlow() {
  const t = useT();
  const reduce = useReduced();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [run, setRun] = useState(0);
  const go = inView || reduce;
  const nodes = [
    { who: t("Recipient"), amount: "−4,500", note: t("Pays the courier at the door.") },
    { who: t("Courier"), amount: "4,500", note: t("Holds the cash until the evening hand-in. The app shows what is owed.") },
    { who: t("Masar"), amount: "600", note: t("Takes the delivery fee for the zone. Nothing else is deducted.") },
    { who: t("Your wallet"), amount: "+3,900", note: t("Credited the moment the parcel is marked delivered.") },
  ];
  const d = (k: number) => (reduce ? 0 : 0.3 + k * 0.7);
  return (
    <div ref={ref}>
      <div key={run} className="relative grid gap-4 md:grid-cols-4 md:gap-6">
        <div className="absolute inset-x-[12%] top-7 hidden h-px bg-white/15 md:block" aria-hidden />
        {go && !reduce && (
          <motion.span
            aria-hidden
            className="absolute top-[22px] hidden size-3 rounded-full bg-accent shadow-[0_0_0_6px_rgba(255,91,36,.25)] md:block"
            initial={{ insetInlineStart: "12%", opacity: 0 }}
            animate={{ insetInlineStart: ["12%", "37.5%", "62.5%", "87%"], opacity: [1, 1, 1, 0] }}
            transition={{ duration: 2.4, delay: 0.3, times: [0, 0.33, 0.66, 1], ease: "easeInOut" }}
          />
        )}
        {nodes.map((n, k) => (
          <motion.div
            key={n.who}
            className="relative rounded-2xl bg-white/[.04] p-5 ring-1 ring-white/10"
            initial={reduce ? false : { opacity: 0.35 }}
            animate={go ? { opacity: 1 } : undefined}
            transition={{ delay: d(k), duration: 0.4 }}
          >
            <span className={`relative z-10 grid size-5 place-items-center rounded-full ${k === 3 ? "bg-accent" : "bg-white/20"}`} aria-hidden>
              <span className="size-1.5 rounded-full bg-white" />
            </span>
            <p className="mt-4 text-sm text-white/60">{n.who}</p>
            <p className={`tnum display mt-1 text-3xl ltr ${k === 3 ? "text-accent" : "text-white"}`}>
              {n.amount} <span className="text-base text-white/50">{t("DZD")}</span>
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-white/65">{n.note}</p>
          </motion.div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[13px] text-white/50">
        <p>{t("Example: a 4,500 DZD order on the north rate of 600 DZD.")}</p>
        {!reduce && (
          <button type="button" onClick={() => setRun((r) => r + 1)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-white/70 hover:text-white">
            <RotateCcw size={14} aria-hidden /> {t("Replay")}
          </button>
        )}
      </div>
    </div>
  );
}
