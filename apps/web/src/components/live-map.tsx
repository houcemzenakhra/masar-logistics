"use client";

import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";
import { Phone, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "./i18n-client";

type Courier = { courierId: string; name: string; phone: string; hub: string | null; lat: number; lng: number; accuracy: number | null; speed: number | null; at: string; deliveries: number; pickups: number };
type Stop = { id: string; tracking: string; seq: number | null; status: string; recipient: string; lat: number | null; lng: number | null };
type Detail = { trail: { lat: number; lng: number; at: string }[]; stops: Stop[] };

const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const minutes = (at: string) => Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60_000));

/**
 * Where every courier on duty is, refreshed every 15 seconds. Select a courier to see today's trail
 * and the stops still to do, numbered in route order.
 */
export function LiveMap() {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const lib = useRef<typeof L | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const detailLayer = useRef<L.LayerGroup | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const fitted = useRef(false);

  const load = useCallback(async () => {
    try {
      const url = chosen ? `/api/v1/courier/positions?courierId=${chosen}` : "/api/v1/courier/positions";
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as { couriers: Courier[] } & Partial<Detail>;
      setCouriers(j.couriers);
      setDetail(j.trail ? { trail: j.trail, stops: j.stops ?? [] } : null);
      setError("");
    } catch {
      setError(t("Could not refresh the map. Retrying."));
    }
  }, [chosen, t]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const Lf = await import("leaflet");
      if (dead || !box.current || map.current) return;
      lib.current = Lf;
      map.current = Lf.map(box.current, { zoomControl: true, attributionControl: true }).setView([34.5, 3], 5);
      Lf.tileLayer(TILES, { maxZoom: 18, attribution: ATTRIBUTION }).addTo(map.current);
      layer.current = Lf.layerGroup().addTo(map.current);
      detailLayer.current = Lf.layerGroup().addTo(map.current);
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    const Lf = lib.current;
    if (!Lf || !map.current || !layer.current) return;
    layer.current.clearLayers();
    for (const c of couriers) {
      const stale = minutes(c.at) > 15;
      Lf.circleMarker([c.lat, c.lng], { radius: c.courierId === chosen ? 10 : 8, color: "#fff", weight: 2, fillColor: stale ? "#8a9099" : "#ff5b24", fillOpacity: 1 })
        .bindTooltip(`${c.name} · ${t("{n} min ago", { n: minutes(c.at) })}`)
        .on("click", () => setChosen(c.courierId))
        .addTo(layer.current);
    }
    if (!fitted.current && couriers.length) {
      map.current.fitBounds(Lf.latLngBounds(couriers.map((c) => [c.lat, c.lng] as [number, number])).pad(0.3), { maxZoom: 13 });
      fitted.current = true;
    }
  }, [couriers, chosen, t]);

  useEffect(() => {
    const Lf = lib.current;
    if (!Lf || !map.current || !detailLayer.current) return;
    detailLayer.current.clearLayers();
    if (!detail) return;
    if (detail.trail.length > 1) Lf.polyline(detail.trail.map((p) => [p.lat, p.lng] as [number, number]), { color: "#0c1a26", weight: 3, opacity: 0.6 }).addTo(detailLayer.current);
    detail.stops.forEach((s, i) => {
      if (s.lat == null || s.lng == null) return;
      // Stops share a commune centre: spread them a little so each number shows.
      const jitter = (i % 5) * 0.0015;
      Lf.marker([s.lat + jitter, s.lng + jitter], {
        icon: Lf.divIcon({ className: "", html: `<span style="display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:${s.status === "pickup_assigned" ? "#2456c4" : "#0c1a26"};color:#fff;font:600 11px system-ui;border:2px solid #fff">${s.seq ?? "P"}</span>`, iconSize: [22, 22] }),
      })
        .bindTooltip(`${s.tracking} · ${s.recipient}`)
        .addTo(detailLayer.current!);
    });
  }, [detail]);

  const selected = couriers.find((c) => c.courierId === chosen);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-line">
        <div ref={box} className="h-[520px] w-full lg:h-[640px]" role="application" aria-label={t("Map of couriers")} />
        {error && <p role="status" className="absolute inset-x-3 top-3 z-[500] rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{error}</p>}
      </div>
      <div className="rounded-2xl bg-surface ring-1 ring-line">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{t("{n} couriers on the map", { n: couriers.length })}</h2>
          <button type="button" onClick={() => void load()} aria-label={t("Refresh")} className="rounded-lg p-1.5 text-muted hover:text-ink"><RefreshCw size={15} /></button>
        </div>
        {couriers.length === 0 && <p className="p-4 text-sm text-muted">{t("No courier has shared a position in the last 12 hours. Positions come from the courier app while the courier is on duty.")}</p>}
        <ul className="max-h-[580px] divide-y divide-line overflow-y-auto">
          {couriers.map((c) => (
            <li key={c.courierId}>
              <button type="button" onClick={() => setChosen(c.courierId === chosen ? null : c.courierId)} aria-pressed={c.courierId === chosen} className={`w-full px-4 py-3 text-start text-sm ${c.courierId === chosen ? "bg-accent-soft" : "hover:bg-paper"}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className={`text-[12px] ${minutes(c.at) > 15 ? "text-muted" : "text-ok"}`}>{t("{n} min ago", { n: minutes(c.at) })}</span>
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {c.hub ? t(c.hub) : "—"} · {t("{d} to deliver, {p} to pick up", { d: c.deliveries, p: c.pickups })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <div className="border-t border-line p-4 text-sm">
            <a href={`tel:${selected.phone.replaceAll(" ", "")}`} className="inline-flex items-center gap-2 font-medium text-info"><Phone size={14} /><span className="ltr">{selected.phone}</span></a>
            <p className="mt-1 text-muted">{t("{n} stops still to do", { n: detail?.stops.length ?? 0 })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
