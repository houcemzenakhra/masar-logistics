import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { livePositions, runStops, trail } from "@/server/services/location";

/** Operations map: couriers seen in the last 12 hours. Hub staff see their own hub's couriers. */
export const GET = route(async (req) => {
  const s = await auth(req, "admin", "hub");
  const db = await getDb();
  const courierId = new URL(req.url).searchParams.get("courierId");
  const couriers = await livePositions(db, s.role === "hub" ? s.hubId : null);
  if (courierId && couriers.some((c) => c.courierId === courierId)) {
    return json({ couriers, trail: await trail(db, courierId), stops: await runStops(db, courierId) });
  }
  return json({ couriers });
});
