"use client";

import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";
import { Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "./i18n-client";

type Live = { courier: string; stopsBefore: number; position: { lat: number; lng: number; at: string } | null; ageMin?: number } | null;

const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * For the recipient while the parcel is out for delivery: how many stops come first, and where the
 * courier is (rounded to about 100 m), refreshed every 20 seconds.
 */
export function TrackLive({ tracking, dest }: { tracking: string; dest: { lat: number; lng: number } | null }) {
  const t = useT();
  const [live, setLive] = useState<Live>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const lib = useRef<typeof L | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/v1/track/${encodeURIComponent(tracking)}/live`, { cache: "no-store" });
        if (!r.ok || stop) return;
        const l = (await r.json()).live as Live;
        // Age is worked out when the answer arrives, so rendering stays pure.
        setLive(l && l.position ? { ...l, ageMin: Math.max(0, Math.round((Date.now() - new Date(l.position.at).getTime()) / 60_000)) } : l);
      } catch {
        /* keep the last value */
      }
    };
    const first = setTimeout(load, 0);
    const id = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [tracking]);

  const pos = live?.position;
  useEffect(() => {
    if (!pos || !box.current) return;
    (async () => {
      const Lf = (lib.current ??= await import("leaflet"));
      if (!map.current) {
        map.current = Lf.map(box.current!, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([pos.lat, pos.lng], 13);
        Lf.tileLayer(TILES, { maxZoom: 17, attribution: "&copy; OpenStreetMap" }).addTo(map.current);
        if (dest) Lf.circleMarker([dest.lat, dest.lng], { radius: 7, color: "#0c1a26", weight: 2, fillColor: "#fff", fillOpacity: 1 }).bindTooltip(t("Your commune")).addTo(map.current);
      }
      if (!marker.current) marker.current = Lf.circleMarker([pos.lat, pos.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#ff5b24", fillOpacity: 1 }).addTo(map.current);
      else marker.current.setLatLng([pos.lat, pos.lng]);
      const pts: [number, number][] = [[pos.lat, pos.lng], ...(dest ? [[dest.lat, dest.lng] as [number, number]] : [])];
      if (pts.length > 1) map.current.fitBounds(Lf.latLngBounds(pts).pad(0.4), { maxZoom: 14 });
    })();
  }, [pos, dest, t]);

  useEffect(() => () => void map.current?.remove(), []);

  if (!live) return null;
  const mins = pos ? (live.ageMin ?? 0) : null;
  return (
    <div className="overflow-hidden rounded-2xl bg-navy text-white">
      <div className="flex items-start gap-3 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent"><Truck size={19} /></span>
        <div>
          <p className="font-medium">
            {live.stopsBefore === 0 ? t("{name} is coming to you next.", { name: live.courier }) : t("{name} has {n} stops before yours.", { name: live.courier, n: live.stopsBefore })}
          </p>
          <p className="mt-0.5 text-sm text-white/60">{mins != null ? t("Position updated {n} min ago.", { n: mins }) : t("The courier's position is not available right now.")}</p>
        </div>
      </div>
      {pos && <div ref={box} className="h-64 w-full" role="img" aria-label={t("Map showing the courier near your commune")} />}
    </div>
  );
}
