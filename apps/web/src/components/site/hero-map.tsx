"use client";

import { useEffect, useRef, useState } from "react";
import type { MapData } from "@/server/services/map";
import { useT } from "../i18n-client";

const ZONE = ["", "#4fa3d9", "#9bbf6a", "#e7b65c"];
const SIGNAL = "#ff5b24";
const DELIVERED = "#3ddc97";

type Seg = { ax: number; ay: number; cx: number; cy: number; bx: number; by: number; len: number };
type Parcel = { segs: Seg[]; total: number; start: number; dur: number; dest: number };
type Glow = { x: number; y: number; start: number };

/** A gentle arc between two points: the control point sits off to one side of the midpoint. */
function seg(ax: number, ay: number, bx: number, by: number, bend: number): Seg {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return { ax, ay, bx, by, cx: mx - (dy / len) * len * bend, cy: my + (dx / len) * len * bend, len };
}

const at = (s: Seg, t: number) => {
  const u = 1 - t;
  return [u * u * s.ax + 2 * u * t * s.cx + t * t * s.bx, u * u * s.ay + 2 * u * t * s.cy + t * t * s.by] as const;
};

/** Where each hub's name sits relative to its marker, so the northern ones do not overlap. */
const LABEL: Record<string, [number, number]> = { ALG: [-46, -30], SET: [-16, 10], CST: [-30, -28], ORN: [-40, 10] };

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * The hero: every commune of Algeria as a dot, coloured by price zone, with parcels travelling
 * from the hubs. Parcels between regions go hub to hub first, as linehaul does.
 * Drawn on a canvas; pauses when off screen or in a background tab; still when motion is reduced.
 */
export function HeroMap({ data }: { data: MapData }) {
  const t = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fit, setFit] = useState<{ s: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const n = data.points.length / 4;
    const P = (i: number) => [data.points[i * 4], data.points[i * 4 + 1], data.points[i * 4 + 2], data.points[i * 4 + 3]] as const;

    let dpr = 1;
    let s = 1;
    let ox = 0;
    let oy = 0;
    let base: HTMLCanvasElement | null = null;
    let raf = 0;
    let visible = true;
    let born = 0;
    const parcels: Parcel[] = [];
    const glows: Glow[] = [];
    let nextSpawn = 0;

    function layout() {
      const w = el.clientWidth;
      const h = el.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      s = Math.min(w / data.width, h / data.height) * 0.94;
      ox = (w - data.width * s) / 2;
      oy = (h - data.height * s) / 2;
      setFit({ s, ox, oy });
      // The dots never change: draw them once to an offscreen canvas.
      base = document.createElement("canvas");
      base.width = cv.width;
      base.height = cv.height;
      const b = base.getContext("2d")!;
      b.scale(dpr, dpr);
      // The country: a faint halftone of the border shape, so the empty south still reads as land.
      const shape = new Path2D();
      for (let i = 0; i < data.outline.length; i += 2) {
        const px = ox + data.outline[i] * s;
        const py = oy + data.outline[i + 1] * s;
        if (i === 0) shape.moveTo(px, py);
        else shape.lineTo(px, py);
      }
      shape.closePath();
      b.save();
      b.clip(shape);
      b.fillStyle = "rgba(255,255,255,0.11)";
      const gap = Math.max(5, s * 11);
      for (let gy = oy; gy < oy + data.height * s; gy += gap)
        for (let gx = ox; gx < ox + data.width * s; gx += gap) {
          b.beginPath();
          b.arc(gx, gy, Math.max(0.7, s * 1.3), 0, Math.PI * 2);
          b.fill();
        }
      b.restore();
      b.strokeStyle = "rgba(255,255,255,0.14)";
      b.lineWidth = 1;
      b.stroke(shape);
      const r = Math.max(1.1, s * 2.4);
      for (let i = 0; i < n; i++) {
        const [x, y, z] = P(i);
        b.fillStyle = ZONE[z];
        b.globalAlpha = 0.62;
        b.beginPath();
        b.arc(ox + x * s, oy + y * s, r, 0, Math.PI * 2);
        b.fill();
      }
      b.globalAlpha = 1;
      for (const hub of data.hubs) {
        const hx = ox + hub.x * s;
        const hy = oy + hub.y * s;
        b.strokeStyle = "rgba(255,255,255,0.9)";
        b.lineWidth = 1.5;
        b.beginPath();
        b.arc(hx, hy, Math.max(4, s * 9), 0, Math.PI * 2);
        b.stroke();
        b.fillStyle = "#fff";
        b.beginPath();
        b.arc(hx, hy, Math.max(1.8, s * 3.5), 0, Math.PI * 2);
        b.fill();
      }
    }

    const X = (x: number) => ox + x * s;
    const Y = (y: number) => oy + y * s;

    function spawn(now: number) {
      // Most parcels leave Algiers, where most sellers are; the rest leave another hub.
      const from = Math.random() < 0.65 ? 0 : 1 + Math.floor(Math.random() * (data.hubs.length - 1));
      const dest = Math.floor(Math.random() * n);
      const [dx, dy, , dh] = P(dest);
      const a = data.hubs[from];
      const segs: Seg[] = [];
      if (dh !== from) segs.push(seg(X(a.x), Y(a.y), X(data.hubs[dh].x), Y(data.hubs[dh].y), 0.18));
      const last = dh !== from ? data.hubs[dh] : a;
      segs.push(seg(X(last.x), Y(last.y), X(dx), Y(dy), 0.12));
      const total = segs.reduce((sum, g) => sum + g.len, 0);
      parcels.push({ segs, total, start: now, dur: 1400 + total * 7, dest });
    }

    function position(p: Parcel, k: number) {
      let d = k * p.total;
      for (const g of p.segs) {
        if (d <= g.len) return { g, u: d / g.len };
        d -= g.len;
      }
      const g = p.segs[p.segs.length - 1];
      return { g, u: 1 };
    }

    function frame(now: number) {
      if (!born) born = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      // Opening: the country is drawn from the coast southwards.
      const reveal = reduce ? 1 : ease(Math.min(1, (now - born) / 1600));
      if (base) {
        const h = cv.height * reveal;
        ctx.drawImage(base, 0, 0, cv.width, h, 0, 0, cv.width, h);
      }
      ctx.scale(dpr, dpr);
      if (reduce) return;

      if (now - born > 1200 && now > nextSpawn && parcels.length < 16) {
        spawn(now);
        nextSpawn = now + 380 + Math.random() * 380;
      }

      for (let i = parcels.length - 1; i >= 0; i--) {
        const p = parcels[i];
        const k = Math.min(1, (now - p.start) / p.dur);
        const e = ease(k);
        // Trail: the route behind the parcel, fading towards its start.
        const steps = 28;
        const from = Math.max(0, e - 0.35);
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        let prev: readonly [number, number] | null = null;
        for (let j = 0; j <= steps; j++) {
          const q = from + ((e - from) * j) / steps;
          const { g, u } = position(p, q);
          const pt = at(g, u);
          if (prev) {
            ctx.strokeStyle = `rgba(255,91,36,${(0.55 * j) / steps})`;
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(pt[0], pt[1]);
            ctx.stroke();
          }
          prev = pt;
        }
        const { g, u } = position(p, e);
        const [hx, hy] = at(g, u);
        ctx.fillStyle = "rgba(255,91,36,0.25)";
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = SIGNAL;
        ctx.beginPath();
        ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (k >= 1) {
          const [dx, dy] = P(p.dest);
          glows.push({ x: X(dx), y: Y(dy), start: now });
          parcels.splice(i, 1);
        }
      }

      // Delivered: a ring that turns green and fades.
      for (let i = glows.length - 1; i >= 0; i--) {
        const g = glows[i];
        const k = (now - g.start) / 1600;
        if (k >= 1) {
          glows.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = DELIVERED;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 2 + k * 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = DELIVERED;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function loop(now: number) {
      frame(now);
      if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(loop);
    }
    const resume = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };

    layout();
    resume();
    const ro = new ResizeObserver(() => {
      layout();
      resume();
    });
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) resume();
    });
    io.observe(el);
    const onVis = () => !document.hidden && resume();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [data]);

  return (
    <figure className="relative h-full w-full">
      <div ref={wrap} className="absolute inset-0">
        <canvas ref={canvas} aria-hidden className="block" />
        {fit &&
          data.hubs.map((h) => (
            <span
              key={h.code}
              className="pointer-events-none absolute whitespace-nowrap text-[11px] font-medium text-white/80 sm:text-xs"
              style={{ left: fit.ox + h.x * fit.s + (LABEL[h.code]?.[0] ?? 10), top: fit.oy + h.y * fit.s + (LABEL[h.code]?.[1] ?? -8) }}
            >
              {t(h.name)}
            </span>
          ))}
      </div>
      <figcaption className="sr-only">{t("Map of Algeria. Each dot is one of {n} communes, coloured by price zone. Orange dots are parcels travelling from the hubs.", { n: data.communes })}</figcaption>
    </figure>
  );
}

export function MapLegend({ communes }: { communes: number }) {
  const t = useT();
  const items: [string, string][] = [
    [ZONE[1], t("North")],
    [ZONE[2], t("Highlands")],
    [ZONE[3], t("South")],
    [SIGNAL, t("Parcel on its way")],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white/60">
      <span>{t("Each dot is a commune: {n} in all.", { n: new Intl.NumberFormat("en-US").format(communes) })}</span>
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}
