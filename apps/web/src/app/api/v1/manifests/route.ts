import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { createManifest, listManifests } from "@/server/services/linehaul";
import { DomainError } from "@/server/services/parcels";

export const GET = route(async (req) => {
  await auth(req, "hub", "admin");
  return json({ manifests: await listManifests(await getDb()) });
});

const Body = z.object({ originHubId: z.string().optional(), destHubId: z.string(), vehicle: z.string().max(40).optional(), driver: z.string().max(80).optional() });

export const POST = route(async (req) => {
  const s = await auth(req, "hub", "admin");
  const b = Body.parse(await req.json());
  const originHubId = s.role === "hub" ? s.hubId : b.originHubId;
  if (!originHubId) throw new DomainError("originHubId is required");
  return json({ manifest: await createManifest(await getDb(), { ...b, originHubId }, s) }, 201);
});
