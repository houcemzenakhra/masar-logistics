import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { merchants } from "@/server/schema";
import { bookPickup, bookableDays, cancelPickup, parseDays, setPickupDays, upcomingPickups } from "@/server/services/pickups";

/** The merchant's regular pickup days (0 = Sunday … 6 = Saturday), bookable days and bookings. */
export const GET = route(async (req) => {
  const s = await auth(req, "merchant");
  const db = await getDb();
  const [[m], booked] = await Promise.all([db.select({ days: merchants.pickupDays }).from(merchants).where(eq(merchants.id, s.merchantId!)), upcomingPickups(db, s.merchantId!)]);
  return json({ days: parseDays(m.days), bookable: bookableDays(), booked });
});

const Body = z.union([
  z.object({ days: z.array(z.number().int()) }),
  z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), window: z.enum(["morning", "afternoon"]).default("morning"), expected: z.number().int().min(0).max(999).optional(), note: z.string().max(200).optional() }),
  z.object({ cancel: z.string() }),
]);

/** `{ days }` sets the regular days; `{ day, window }` books a pickup; `{ cancel: id }` cancels one. */
export const POST = route(async (req) => {
  const s = await auth(req, "merchant");
  const db = await getDb();
  const b = Body.parse(await req.json());
  if ("days" in b) return json({ days: await setPickupDays(db, s.merchantId!, b.days) });
  if ("cancel" in b) return json({ pickup: await cancelPickup(db, s.merchantId!, b.cancel) });
  return json({ pickup: await bookPickup(db, { merchantId: s.merchantId!, userId: s.userId, ...b }) }, 201);
});
