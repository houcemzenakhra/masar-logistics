import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { hubSummary } from "@/server/services/hub";
import { DomainError } from "@/server/services/parcels";

export const GET = route(async (req) => {
  const s = await auth(req, "hub", "admin");
  const hubId = s.role === "hub" ? s.hubId : new URL(req.url).searchParams.get("hubId");
  if (!hubId) throw new DomainError("hubId is required");
  return json(await hubSummary(await getDb(), hubId));
});
