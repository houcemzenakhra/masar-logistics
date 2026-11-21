import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { listParcels } from "@/server/services/parcels";
import { DESK_HOLD_DAYS } from "@/server/services/sms";

/**
 * The hub's stop desk counter: parcels that arrived for a desk (put them on the shelf with
 * POST /parcels/:id/transition `ready_for_pickup`) and parcels on the shelf (hand over with
 * POST /parcels/:id/deliver and the recipient's code). Operations pass `?hubId=`.
 */
export const GET = route(async (req) => {
  const s = await auth(req, "hub", "admin");
  const hubId = s.role === "hub" ? s.hubId! : new URL(req.url).searchParams.get("hubId");
  if (!hubId) return json({ error: "hubId is required" }, 400);
  const rows = await listParcels(await getDb(), { deskHubId: hubId, status: ["at_origin_hub", "at_destination_hub", "ready_for_pickup"], limit: 300 });
  const now = Date.now();
  return json({
    holdDays: DESK_HOLD_DAYS,
    toShelve: rows.filter((p) => p.status === "at_destination_hub" || (p.status === "at_origin_hub" && p.originHubId === p.destHubId && !p.bagId)),
    onShelf: rows
      .filter((p) => p.status === "ready_for_pickup")
      .map((p) => ({ ...p, daysWaiting: Math.floor((now - p.updatedAt.getTime()) / 86400_000) }))
      .sort((a, b) => b.daysWaiting - a.daysWaiting),
  });
});
