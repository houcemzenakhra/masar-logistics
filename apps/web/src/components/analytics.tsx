import Link from "next/link";
import { money } from "@/lib/format";
import { place, t } from "@/lib/i18n";
import type { byCourier, byMerchant, byWilaya, daily, failureReasons, overview } from "@/server/services/analytics";
import { PERIODS } from "@/server/services/analytics";
import { Card, CardHeader, Stat, Table, Td } from "./ui";

type Overview = Awaited<ReturnType<typeof overview>>;

/** Orders and deliveries per day, side by side. */
function DailyBars({ data }: { data: Awaited<ReturnType<typeof daily>> }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.created, d.delivered]));
  const created = data.reduce((s, d) => s + d.created, 0);
  const delivered = data.reduce((s, d) => s + d.delivered, 0);
  const label = t("{a} orders and {b} deliveries over {d} days", { a: created, b: delivered, d: data.length });
  return (
    <figure className="p-5">
      <div className="flex h-44 items-end gap-[3px]" role="img" aria-label={label}>
        {data.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end gap-px" title={`${d.day}: ${d.created} / ${d.delivered}`}>
            <div className="flex-1 rounded-t-sm bg-ink-2/25" style={{ height: `${Math.max(2, (d.created / max) * 100)}%` }} />
            <div className="flex-1 rounded-t-sm bg-accent" style={{ height: `${Math.max(2, (d.delivered / max) * 100)}%`, opacity: d.delivered ? 1 : 0.3 }} />
          </div>
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ink-2/25" /> {t("Ordered")}</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent" /> {t("Delivered")}</span>
        </span>
        <span className="ltr">{data[0]?.day.slice(5)} → {data.at(-1)?.day.slice(5)}</span>
      </figcaption>
    </figure>
  );
}

/** A share shown as a number and a thin bar; red under 70 %, amber under 85 %. */
function Rate({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted">—</span>;
  const tone = v < 70 ? "bg-danger" : v < 85 ? "bg-warn" : "bg-ok";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tnum w-9 text-end">{v}%</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line" aria-hidden><span className={`block h-full ${tone}`} style={{ width: `${v}%` }} /></span>
    </span>
  );
}

const days = (h: number) => (h < 48 ? t("{n} h", { n: h }) : t("{n} days", { n: Math.round(h / 24) }));

export function PeriodChips({ base, period }: { base: string; period: number }) {
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset ${on ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line hover:bg-paper"}`;
  return (
    <nav className="flex gap-2" aria-label={t("Period")}>
      {PERIODS.map((p) => <Link key={p} href={`${base}?days=${p}`} className={chip(p === period)} aria-current={p === period ? "page" : undefined}>{t("{n} days", { n: p })}</Link>)}
    </nav>
  );
}

export function Kpis({ o, money: showMoney = true }: { o: Overview; money?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat tone="accent" label={t("Delivered")} value={o.successRate === null ? "—" : `${o.successRate}%`} hint={t("{a} of {b} finished parcels", { a: o.delivered, b: o.finished })} />
      <Stat label={t("Delivered on the first try")} value={o.firstTryRate === null ? "—" : `${o.firstTryRate}%`} hint={t("{n} still on their way", { n: o.inProgress })} />
      <Stat label={t("Order to door")} value={o.delivered ? days(o.hours) : "—"} hint={t("On average, for delivered parcels")} />
      {showMoney ? (
        <Stat label={t("Cash collected")} value={money(o.cash)} unit="DZD" hint={t("Fees earned: {x} DZD", { x: money(o.fees) })} />
      ) : (
        <Stat label={t("Recipients' rating")} value={o.rating ? o.rating.toFixed(1) : "—"} unit={o.rating ? "/ 5" : undefined} hint={t("{n} ratings", { n: o.ratings })} />
      )}
    </div>
  );
}

export function Trend({ data }: { data: Awaited<ReturnType<typeof daily>> }) {
  return (
    <Card>
      <CardHeader title={t("Orders and deliveries per day")} />
      <DailyBars data={data} />
    </Card>
  );
}

export function WilayaTable({ rows, limit = 15 }: { rows: Awaited<ReturnType<typeof byWilaya>>; limit?: number }) {
  return (
    <Card className="min-w-0">
      <CardHeader title={t("By destination wilaya")} hint={t("Busiest first. Refused: sent back because the recipient refused at the door.")} />
      <Table head={["Wilaya", "Orders", "Delivered", "Refused", "Order to door"]} empty={rows.length === 0}>
        {rows.slice(0, limit).map((w) => (
          <tr key={w.id}>
            <Td className="font-medium"><span className="tnum me-2 text-muted">{String(w.id).padStart(2, "0")}</span>{place(w.name, w.nameAr)}</Td>
            <Td className="tnum">{w.orders}</Td>
            <Td><Rate v={w.successRate} /></Td>
            <Td className={`tnum ${w.refused ? "text-danger" : "text-muted"}`}>{w.refused}</Td>
            <Td className="text-[13px] text-muted">{w.delivered ? days(w.hours) : "—"}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

export function Reasons({ rows }: { rows: Awaited<ReturnType<typeof failureReasons>> }) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  return (
    <Card className="min-w-0">
      <CardHeader title={t("Why deliveries failed")} hint={t("{n} failed attempts", { n: total })} />
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-muted">{t("No failed attempt in this period.")}</p>
      ) : (
        <ul className="space-y-3 p-5">
          {rows.slice(0, 8).map((r) => (
            <li key={r.reason}>
              <div className="flex justify-between text-sm"><span>{t(r.reason || "Other reason")}</span><span className="tnum text-muted">{r.n}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-warn" style={{ width: `${(r.n / total) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function CourierTable({ rows }: { rows: Awaited<ReturnType<typeof byCourier>> }) {
  return (
    <Card className="min-w-0">
      <CardHeader title={t("Couriers")} hint={t("Deliveries and failed attempts they recorded.")} />
      <Table head={["Courier", "Attempts", "Delivered", "Rating"]} empty={rows.length === 0}>
        {rows.map((c) => (
          <tr key={c.id}>
            <Td className="font-medium">{c.name}</Td>
            <Td className="tnum">{c.attempts}</Td>
            <Td><Rate v={c.successRate} /></Td>
            <Td className="tnum text-[13px]">{c.rating ? `${c.rating.toFixed(1)} ★` : "—"}<span className="ms-1 text-muted">{c.ratings ? `(${c.ratings})` : ""}</span></Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

export function MerchantTable({ rows }: { rows: Awaited<ReturnType<typeof byMerchant>> }) {
  return (
    <Card className="min-w-0">
      <CardHeader title={t("Merchants")} hint={t("Returns are what cost the most: watch merchants with many.")} />
      <Table head={["Merchant", "Orders", "Delivered", "Returned", "Fees"]} empty={rows.length === 0}>
        {rows.slice(0, 20).map((m) => (
          <tr key={m.id}>
            <Td className="font-medium">{m.name}</Td>
            <Td className="tnum">{m.orders}</Td>
            <Td className="tnum">{m.delivered}</Td>
            <Td className={`tnum ${m.returnRate !== null && m.returnRate >= 25 ? "text-danger" : ""}`}>{m.returned}{m.returnRate !== null && <span className="ms-1 text-[12px] text-muted">({m.returnRate}%)</span>}</Td>
            <Td className="tnum">{money(m.fees)}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
