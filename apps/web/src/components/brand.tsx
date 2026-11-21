"use client";

import { createContext, useContext, type ReactNode } from "react";

export type BrandInfo = { name: string; supportPhone: string; supportEmail: string };
const BrandContext = createContext<BrandInfo>({ name: "Masar", supportPhone: "", supportEmail: "" });

export function BrandProvider({ value, children }: { value: BrandInfo; children: ReactNode }) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** The mark in the brand colour and the company's name ("masar" in lower case, as designed). */
export function Logo({ light = false, className = "" }: { light?: boolean; className?: string }) {
  const { name } = useBrand();
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight", light ? "text-white" : "text-ink", className)}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" rx="8" fill="var(--color-accent)" />
        <path d="M7 20V11.5a3 3 0 0 1 5.6-1.5l1.4 2.4 1.4-2.4A3 3 0 0 1 21 11.5V15" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="21" cy="19.5" r="2" fill="#fff" />
      </svg>
      <span className="text-[19px] leading-none">{name === "Masar" ? "masar" : name}</span>
    </span>
  );
}
