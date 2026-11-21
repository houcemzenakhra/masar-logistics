import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { t } from "@/lib/i18n";
import { STATUS_LABEL, STATUS_TONE, type Status, type Tone } from "@/server/domain/state";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Logo({ light = false, className = "" }: { light?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight", light ? "text-white" : "text-ink", className)}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" rx="8" fill="#ff5b24" />
        <path d="M7 20V11.5a3 3 0 0 1 5.6-1.5l1.4 2.4 1.4-2.4A3 3 0 0 1 21 11.5V15" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="21" cy="19.5" r="2" fill="#fff" />
      </svg>
      <span className="text-[19px] leading-none">masar</span>
    </span>
  );
}

const TONE: Record<Tone, string> = {
  neutral: "bg-paper text-ink-2 ring-line",
  info: "bg-info-soft text-info ring-info/15",
  progress: "bg-progress-soft text-progress ring-progress/15",
  success: "bg-ok-soft text-ok ring-ok/15",
  warn: "bg-warn-soft text-warn ring-warn/20",
  danger: "bg-danger-soft text-danger ring-danger/15",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", TONE[tone])}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status as Status;
  return <Badge tone={STATUS_TONE[s] ?? "neutral"}>{t(STATUS_LABEL[s] ?? status)}</Badge>;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-2xl border border-line bg-surface shadow-card", className)}>{children}</section>;
}

export function CardHeader({ title, hint, action }: { title: ReactNode; hint?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, unit, hint, tone }: { label: string; value: ReactNode; unit?: string; hint?: string; tone?: "accent" }) {
  return (
    <div className={cx("rounded-2xl border p-5 shadow-card", tone === "accent" ? "border-navy bg-navy text-white" : "border-line bg-surface")}>
      <p className={cx("text-sm", tone === "accent" ? "text-white/60" : "text-muted")}>{label}</p>
      <p className="tnum mt-2 text-[28px] font-semibold leading-none tracking-tight">
        {value}
        {unit && <span className={cx("ms-1.5 text-sm font-medium", tone === "accent" ? "text-white/60" : "text-muted")}>{unit}</span>}
      </p>
      {hint && <p className={cx("mt-2 text-xs", tone === "accent" ? "text-white/50" : "text-muted")}>{hint}</p>}
    </div>
  );
}

const BTN = {
  primary: "bg-accent text-white hover:bg-accent-deep shadow-sm",
  dark: "bg-navy text-white hover:bg-navy-2",
  ghost: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-paper",
  danger: "bg-surface text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger-soft",
};
const btn = (variant: keyof typeof BTN = "primary", size: "sm" | "md" = "md") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
    BTN[variant],
  );

export function Button({ variant, size, className, ...p }: ComponentProps<"button"> & { variant?: keyof typeof BTN; size?: "sm" | "md" }) {
  return <button {...p} className={cx(btn(variant, size), className)} />;
}

export function LinkButton({ variant, size, className, ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof BTN; size?: "sm" | "md" }) {
  return <Link {...p} className={cx(btn(variant, size), className)} />;
}

/** A link to a file (a CSV or a template). A plain anchor, not a router link, so the client router never waits on a download. */
export function DownloadButton({ variant, size, className, ...p }: ComponentProps<"a"> & { variant?: keyof typeof BTN; size?: "sm" | "md" }) {
  return <a download {...p} className={cx(btn(variant, size), className)} />;
}

const FIELD = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = (p: ComponentProps<"input">) => <input {...p} className={cx(FIELD, p.className)} />;
export const Select = (p: ComponentProps<"select">) => <select {...p} className={cx(FIELD, "pe-8", p.className)} />;

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-start text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-5 py-3 font-medium">{typeof h === "string" && h ? t(h) : h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="px-5 py-10 text-center text-sm text-muted">{t("Nothing here yet.")}</p>}
    </div>
  );
}

export const Td = ({ className = "", ...p }: ComponentProps<"td">) => <td {...p} className={cx("px-5 py-3 align-middle", className)} />;

export const Mono = ({ children }: { children: ReactNode }) => <span className="inline-block font-mono text-[13px] font-medium tracking-tight">{children}</span>;

export function Money({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={cx("tnum whitespace-nowrap", className)}>
      {new Intl.NumberFormat("en-US").format(value)} <span className="text-xs text-muted">{t("DZD")}</span>
    </span>
  );
}

export function Notice({ tone = "warn", title, children }: { tone?: "warn" | "info"; title: string; children?: ReactNode }) {
  return (
    <div className={cx("mb-5 rounded-2xl border px-5 py-4 text-sm", tone === "warn" ? "border-warn/25 bg-warn-soft text-warn" : "border-info/20 bg-info-soft text-info")}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 opacity-90">{children}</div>}
    </div>
  );
}
