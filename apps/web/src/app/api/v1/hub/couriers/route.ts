import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { couriersWithCash } from "@/server/services/money";

/** Couriers of the hub with the cash each should hand in. */
export const GET = route(async (req) => {
  const s = await auth(req, "hub", "admin");
  const hubId = s.role === "hub" ? s.hubId : new URL(req.url).searchParams.get("hubId");
  return json({ couriers: await couriersWithCash(await getDb(), hubId) });
});
