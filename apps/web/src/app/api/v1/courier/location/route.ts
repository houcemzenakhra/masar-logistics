import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { parsePoints, recordPositions } from "@/server/services/location";

const Body = z.object({ points: z.array(z.unknown()).min(1).max(500) });

/** Positions from the courier app while on duty; a batch when it was offline. */
export const POST = route(async (req) => {
  const s = await auth(req, "courier");
  const b = Body.parse(await req.json());
  const saved = await recordPositions(await getDb(), s.userId, parsePoints(b.points));
  return json({ saved });
});
