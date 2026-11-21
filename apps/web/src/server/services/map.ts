import { eq } from "drizzle-orm";
import type { Q } from "../db";
import { communes, hubs, wilayas } from "../schema";

/**
 * Points for the website's map of Algeria, one per commune, projected to a flat map.
 * Longitude is scaled by cos(28°), Algeria's middle latitude, so the country keeps its shape.
 * Packed as [x, y, zone, hubIndex] per commune to keep the page small.
 */
export type MapData = { width: number; height: number; points: number[]; outline: number[]; hubs: { code: string; name: string; x: number; y: number }[]; communes: number };

const BOUNDS = { west: -8.8, east: 12.1, south: 18.8, north: 37.2 };
const K = Math.cos((28 * Math.PI) / 180);
const SCALE = 1000 / ((BOUNDS.east - BOUNDS.west) * K);

const project = (lat: number, lng: number) => [Math.round((lng - BOUNDS.west) * K * SCALE), Math.round((BOUNDS.north - lat) * SCALE)] as const;

/**
 * Algeria's border, simplified to about forty points (lng, lat). Only drawn as a faint backdrop
 * behind the communes, so it is approximate on purpose.
 */
const BORDER = [
  [-2.2, 35.1], [-1.3, 35.3], [0.1, 35.9], [1.2, 36.5], [2.9, 36.8], [3.9, 36.9], [5.1, 36.75], [6.3, 37.08], [7.2, 37.0], [8.62, 36.94],
  [8.4, 36.4], [8.25, 35.6], [8.3, 34.6], [7.8, 33.9], [7.55, 33.3], [8.3, 32.5], [9.05, 32.1], [9.5, 30.2], [9.85, 29.2], [9.9, 27.9],
  [9.65, 26.4], [10.2, 24.8], [11.0, 24.4], [12.0, 23.5], [9.6, 22.1], [7.5, 20.9], [5.8, 19.45], [4.25, 19.15], [3.25, 19.8], [1.8, 20.3],
  [-1.4, 22.6], [-4.8, 25.0], [-6.5, 26.25], [-8.67, 27.3], [-8.67, 28.7], [-7.0, 29.45], [-5.2, 29.9], [-3.6, 30.9], [-2.2, 31.9], [-1.2, 32.1],
  [-1.5, 33.3], [-1.7, 34.0], [-2.2, 35.1],
];

export async function mapData(q: Q): Promise<MapData> {
  const [rows, hubRows] = await Promise.all([
    q.select({ lat: communes.lat, lng: communes.lng, zone: wilayas.zone, hubId: wilayas.hubId }).from(communes).innerJoin(wilayas, eq(communes.wilayaId, wilayas.id)),
    q.select().from(hubs),
  ]);
  const order = ["ALG", "ORN", "CST", "SET", "OUA", "BEC"];
  const hubList = hubRows.filter((h) => h.lat !== null).sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  const index = new Map(hubList.map((h, i) => [h.id, i]));
  const points: number[] = [];
  for (const r of rows) {
    const [x, y] = project(r.lat, r.lng);
    points.push(x, y, r.zone, index.get(r.hubId) ?? 0);
  }
  return {
    outline: BORDER.flatMap(([lng, lat]) => project(lat, lng)),
    width: 1000,
    height: Math.round((BOUNDS.north - BOUNDS.south) * SCALE),
    points,
    hubs: hubList.map((h) => {
      const [x, y] = project(h.lat!, h.lng!);
      return { code: h.code, name: h.name, x, y };
    }),
    communes: rows.length,
  };
}
