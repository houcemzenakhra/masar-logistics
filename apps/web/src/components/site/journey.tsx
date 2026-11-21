"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useReduced } from "./use-reduced";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { renderParcelSms } from "@/server/domain/sms-text";
import { useLocale, useT } from "../i18n-client";

const STEP_MS = 5200;
const TRACKING = "MSR004512907";

type Step = { title: string; body: string; scene: () => ReactNode };

/**
 * How a parcel moves, step by step, with a small animated scene for each. Advances by itself
 * while on screen; any click or focus takes over. With reduced motion it stays where you put it.
 */
export function Journey() {
  const t = useT();
  const lang = useLocale() === "ar" ? "ar" : "fr";
  const reduce = useReduced();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0);

  const steps: Step[] = [
    { title: t("You create the order"), body: t("Recipient, commune and the amount to collect. Or import a spreadsheet of hundreds."), scene: () => <OrderScene /> },
    { title: t("A courier picks it up"), body: t("The parcel is scanned at your door, so its history starts there."), scene: () => <PickupScene /> },
    { title: t("Sorted at the hub"), body: t("Every hub scan is recorded against the parcel. Nothing moves without one."), scene: () => <ScanScene /> },
    { title: t("Linehaul in a sealed bag"), body: t("Parcels for another region travel in a sealed bag on a manifest, hub to hub."), scene: () => <BagScene /> },
    { title: t("The recipient gets a text"), body: t("In French or Arabic, with the courier's number and the amount to have ready."), scene: () => <SmsScene lang={lang} /> },
    { title: t("Delivered, and you are paid"), body: t("Cash is collected at the door and your balance updates the same minute."), scene: () => <PaidScene /> },
  ];

  useEffect(() => {
    if (!playing || !inView || reduce) return;
    const id = setTimeout(() => setI((x) => (x + 1) % steps.length), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, inView, reduce, i, tick, steps.length]);

  const go = (n: number) => {
    setI(n);
    setTick((x) => x + 1);
  };
  const running = playing && inView && !reduce;

  return (
    <div ref={ref} className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
      <div>
        <ol className="space-y-1" aria-label={t("Steps")}>
          {steps.map((s, n) => (
            <li key={n}>
              <button
                type="button"
                onClick={() => go(n)}
                aria-current={n === i ? "step" : undefined}
                className={`group relative w-full overflow-hidden rounded-2xl px-4 py-3 text-start transition-colors ${n === i ? "bg-white shadow-card" : "hover:bg-white/60"}`}
              >
                <span className="flex items-baseline gap-3">
                  <span className={`tnum text-sm font-medium ${n === i ? "text-accent" : "text-muted"}`}>{n + 1}</span>
                  <span className={`font-medium ${n === i ? "text-ink" : "text-ink-2"}`}>{s.title}</span>
                </span>
                <AnimatePresence initial={false}>
                  {n === i && (
                    <motion.p
                      key="b"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.25 }}
                      className="overflow-hidden ps-6 text-[15px] leading-relaxed text-ink-2"
                    >
                      <span className="block pt-1.5">{s.body}</span>
                    </motion.p>
                  )}
                </AnimatePresence>
                {n === i && running && (
                  <motion.span
                    key={`${i}-${tick}`}
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent rtl:origin-right"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                  />
                )}
              </button>
            </li>
          ))}
        </ol>
        {!reduce && (
          <button type="button" onClick={() => setPlaying((p) => !p)} className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-ink-2 hover:bg-white/60">
            {playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
            {playing ? t("Pause") : t("Play")}
          </button>
        )}
      </div>
      <div className="relative min-h-[360px] overflow-hidden rounded-[28px] bg-navy sm:min-h-[420px]" aria-live="polite">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,.14)_1px,transparent_1px)] [background-size:18px_18px]" aria-hidden />
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            className="absolute inset-0 grid place-items-center p-6 sm:p-10"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 1.01 }}
            transition={{ duration: reduce ? 0 : 0.3 }}
          >
            {steps[i].scene()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const card = "w-full max-w-sm rounded-2xl bg-white p-5 text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,.5)]";

function Typed({ text, delay = 0 }: { text: string; delay?: number }) {
  const reduce = useReduced();
  const [typed, setN] = useState(0);
  const n = reduce ? text.length : typed;
  useEffect(() => {
    if (reduce) return;
    let id: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 1)), 38);
    }, delay);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [text, delay, reduce]);
  return (
    <span>
      {text.slice(0, n)}
      <span className="sr-only">{text.slice(n)}</span>
    </span>
  );
}

function OrderScene() {
  const t = useT();
  const rows: [string, string, number][] = [
    [t("Recipient"), "Amina Belkacem", 200],
    [t("Commune"), "Bab Ezzouar, 16", 900],
    [t("Cash to collect"), "4,500 DZD", 1500],
  ];
  return (
    <div className={card}>
      <p className="text-sm font-medium text-muted">{t("New order")}</p>
      <dl className="mt-3 space-y-2.5">
        {rows.map(([k, v, d]) => (
          <div key={k} className="rounded-xl border border-line px-3 py-2">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="ltr text-[15px] font-medium"><Typed text={v} delay={d} /></dd>
          </div>
        ))}
      </dl>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.4 }} className="mt-4 flex items-center justify-between rounded-xl bg-navy px-3 py-2.5 text-white">
        <span className="text-sm">{t("Label ready")}</span>
        <span className="font-mono text-sm">{TRACKING}</span>
      </motion.div>
    </div>
  );
}

function PickupScene() {
  const t = useT();
  const reduce = useReduced();
  return (
    <div className="w-full max-w-md text-white">
      <div className="relative h-24">
        <div className="absolute inset-x-6 top-1/2 h-px border-t border-dashed border-white/30" />
        <Node label={t("Your shop")} className="start-0" />
        <Node label={t("Algiers Hub")} className="end-0" hub />
        <motion.div
          className="absolute top-1/2 -mt-4 grid size-8 place-items-center rounded-full bg-accent shadow-[0_0_0_6px_rgba(255,91,36,.2)]"
          initial={{ insetInlineStart: "8%" }}
          animate={{ insetInlineStart: reduce ? "70%" : ["8%", "8%", "82%"] }}
          transition={{ duration: 3, times: [0, 0.3, 1], ease: "easeInOut" }}
        >
          <span className="size-2.5 rounded-sm bg-white" />
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 0.8 }} className="mx-auto mt-6 w-fit rounded-full bg-white/10 px-4 py-2 text-sm">
        <span className="text-white/60">{TRACKING}</span> <span className="ms-2 font-medium">{t("Picked up")}</span>
      </motion.div>
    </div>
  );
}

function Node({ label, className, hub }: { label: string; className: string; hub?: boolean }) {
  return (
    <div className={`absolute top-1/2 -mt-3 flex flex-col items-center ${className}`}>
      <span className={`size-6 rounded-full ${hub ? "border-2 border-white bg-navy" : "bg-white"}`} />
      <span className="mt-2 whitespace-nowrap text-xs text-white/70">{label}</span>
    </div>
  );
}

function ScanScene() {
  const t = useT();
  const reduce = useReduced();
  const events = [t("Picked up"), t("At hub"), t("Sorted")];
  return (
    <div className={card}>
      <div className="relative overflow-hidden rounded-xl border border-line p-4">
        <div className="flex h-16 items-end gap-[3px]" aria-hidden>
          {Array.from({ length: 44 }, (_, k) => (
            <span key={k} className="bg-ink" style={{ width: (k * 7) % 3 === 0 ? 3 : 1.5, height: "100%" }} />
          ))}
        </div>
        <p className="mt-2 text-center font-mono text-sm">{TRACKING}</p>
        {!reduce && (
          <motion.span className="absolute inset-x-0 h-0.5 bg-accent shadow-[0_0_14px_2px_rgba(255,91,36,.7)]" initial={{ top: "8%" }} animate={{ top: ["8%", "70%", "8%"] }} transition={{ duration: 1.6, repeat: 1 }} />
        )}
      </div>
      <ol className="mt-4 space-y-2">
        {events.map((e, k) => (
          <motion.li key={e} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduce ? 0 : 0.6 + k * 0.7 }} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-ok" />
              {e}
            </span>
            <span className="text-muted">{k === 0 ? t("Your shop") : t("Algiers Hub")}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function BagScene() {
  const t = useT();
  const reduce = useReduced();
  return (
    <div className="w-full max-w-md text-white">
      <div className="flex items-center justify-between text-sm">
        <span>{t("Algiers Hub")}</span>
        <span>{t("Oran Hub")}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-white/10">
        <motion.div className="absolute inset-y-0 start-0 rounded-full bg-accent" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: reduce ? 0 : 3.2, ease: "easeInOut" }} />
      </div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.3 }} className="mt-8 rounded-2xl bg-white p-5 text-ink">
        <div className="flex items-center justify-between">
          <span className="font-medium">{t("Bag")} <span className="font-mono">BAG-ALG-ORN-0412</span></span>
          <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-medium text-ok">{t("Sealed")}</span>
        </div>
        <div className="mt-4 grid grid-cols-6 gap-1.5" aria-hidden>
          {Array.from({ length: 18 }, (_, k) => (
            <motion.span key={k} className={`h-5 rounded ${k === 7 ? "bg-accent" : "bg-paper ring-1 ring-line"}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduce ? 0 : 0.4 + k * 0.04 }} />
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted">{t("{n} parcels on the manifest, yours included.", { n: 18 })}</p>
      </motion.div>
    </div>
  );
}

function SmsScene({ lang }: { lang: "fr" | "ar" }) {
  const text = renderParcelSms("out_for_delivery", lang, { tracking: TRACKING, merchant: "Dar El Moda", merchantPhone: "0550 12 34 56", cod: 4500, courier: "Karim", courierPhone: "0770 11 22 33" }, "masar.dz");
  const reduce = useReduced();
  return (
    <div className="w-full max-w-[290px] rounded-[34px] bg-[#1b2a38] p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,.6)] ring-1 ring-white/10">
      <div className="rounded-[26px] bg-[#f1f3f4] px-3 pb-6 pt-4">
        <p className="text-center text-xs font-medium text-muted">MASAR</p>
        <motion.p
          dir={lang === "ar" ? "rtl" : "ltr"}
          lang={lang}
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: reduce ? 0 : 0.5, type: "spring", stiffness: 260, damping: 22 }}
          className="mt-4 rounded-2xl rounded-ss-md bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink shadow-sm"
        >
          {text}
        </motion.p>
      </div>
    </div>
  );
}

function PaidScene() {
  const t = useT();
  const reduce = useReduced();
  const [counted, setN] = useState(0);
  const n = reduce ? 3900 : counted;
  useEffect(() => {
    if (reduce) return;
    const start = performance.now() + 700;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / 1100));
      setN(Math.round(3900 * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);
  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm">{TRACKING}</span>
        <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", delay: reduce ? 0 : 0.2 }} className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-medium text-ok">
          {t("Delivered")}
        </motion.span>
      </div>
      <div className="mt-5 rounded-xl bg-paper p-4">
        <p className="text-sm text-muted">{t("Wallet")}</p>
        <p className="tnum display mt-1 text-4xl text-ink">
          +{new Intl.NumberFormat("en-US").format(n)} <span className="text-lg text-muted">{t("DZD")}</span>
        </p>
        <p className="mt-2 text-[13px] text-ink-2">{t("4,500 collected, less the 600 delivery fee.")}</p>
      </div>
    </div>
  );
}
