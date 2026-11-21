"use client";

import { AnimatePresence, motion } from "motion/react";
import { useReduced } from "./use-reduced";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n-client";

/** The site menu on phones: a sheet that drops from the top bar. */
export function MobileMenu({ links, footer, dark }: { links: { href: string; label: string }[]; footer: ReactNode; dark: boolean }) {
  const t = useT();
  const path = usePathname();
  // Remembers the page the menu was opened on, so moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenOn((typeof v === "function" ? v(open) : v) ? path : null);
  const reduce = useReduced();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const bar = dark ? "bg-white" : "bg-ink";
  return (
    <div className="md:hidden">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? t("Close menu") : t("Open menu")}
        className="relative z-50 grid size-10 place-items-center rounded-xl"
      >
        <span className="relative block h-3 w-5">
          <motion.span className={`absolute inset-x-0 top-0 h-0.5 rounded ${open ? "bg-white" : bar}`} animate={open ? { top: 5, rotate: 45 } : { top: 0, rotate: 0 }} transition={{ duration: reduce ? 0 : 0.2 }} />
          <motion.span className={`absolute inset-x-0 bottom-0 h-0.5 rounded ${open ? "bg-white" : bar}`} animate={open ? { bottom: 5, rotate: -45 } : { bottom: 0, rotate: 0 }} transition={{ duration: reduce ? 0 : 0.2 }} />
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id="site-menu"
            className="fixed inset-0 z-40 flex flex-col bg-navy px-6 pb-8 pt-24 text-white"
            initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0 0% 0)" }}
            exit={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: reduce ? 0.1 : 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <nav aria-label={t("Main")} className="flex flex-col">
              {links.map((l, i) => (
                <motion.div key={l.href} initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.12 + i * 0.04 }}>
                  <Link href={l.href} onClick={() => setOpen(false)} className="display block border-b border-white/10 py-4 text-3xl">
                    {l.label}
                  </Link>
                </motion.div>
              ))}
            </nav>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-4">{footer}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
