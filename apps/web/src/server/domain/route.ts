/** Delivery route ordering. Pure functions. */

export type Point = { lat: number; lng: number };
export type Stop = Point & { id: string | number };

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Straight-line distance in kilometres. */
export function km(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pathKm(start: Point, stops: Point[]): number {
  let total = 0;
  let at = start;
  for (const s of stops) {
    total += km(at, s);
    at = s;
  }
  return total;
}

/**
 * Orders stops to shorten a one-way trip that begins at `start` (the hub) and ends at the last stop.
 * Nearest-neighbour builds a first route, then 2-opt removes crossings until no swap helps.
 * Good routes for the tens of stops a courier carries; not guaranteed optimal.
 */
export function optimise<T extends Stop>(start: Point, stops: T[]): { order: T[]; km: number } {
  const left = [...stops];
  const route: T[] = [];
  let at: Point = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (km(at, left[i]) < km(at, left[best])) best = i;
    at = left[best];
    route.push(left.splice(best, 1)[0]);
  }

  const before = (i: number): Point => (i === 0 ? start : route[i - 1]);
  let improved = route.length > 2;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        // Reversing route[i..j] replaces edges (i-1,i) and (j,j+1) with (i-1,j) and (i,j+1).
        const next = route[j + 1];
        const now = km(before(i), route[i]) + (next ? km(route[j], next) : 0);
        const then = km(before(i), route[j]) + (next ? km(route[i], next) : 0);
        if (then < now - 1e-9) {
          let a = i;
          let b = j;
          while (a < b) [route[a++], route[b--]] = [route[b], route[a]];
          improved = true;
        }
      }
    }
  }
  return { order: route, km: pathKm(start, route) };
}
