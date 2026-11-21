import { route } from "@/lib/api";
import { getDb } from "@/server/db";
import { publicLive } from "@/server/services/location";

/**
 * Public: where the courier is, only while the parcel is out for delivery, rounded to about 100 m.
 * `null` the rest of the time.
 */
export const GET = route(async (_req, ctx: { params: Promise<{ tracking: string }> }) => {
  const live = await publicLive(await getDb(), (await ctx.params).tracking);
  return Response.json({ live }, { headers: { "cache-control": "no-store" } });
});
