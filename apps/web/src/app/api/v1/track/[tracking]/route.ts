import { json, notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { getParcel } from "@/server/services/parcels";

/** Public tracking: status and scan history only, no personal details. */
export const GET = route(async (_req, ctx: { params: Promise<{ tracking: string }> }) => {
  const p = await getParcel(await getDb(), { tracking: (await ctx.params).tracking });
  if (!p) throw notFound("No parcel with that tracking number");
  return json({
    tracking: p.tracking,
    status: p.status,
    destination: { wilaya: p.destWilaya, commune: p.commune },
    merchant: p.merchantName,
    updatedAt: p.updatedAt,
    events: p.events.map((e) => ({ status: e.status, at: e.createdAt, hub: e.hub })),
  });
});
