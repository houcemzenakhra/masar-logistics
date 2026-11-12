import { auth, json, notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { getParcel } from "@/server/services/parcels";

export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const s = await auth(req);
  const parcel = await getParcel(await getDb(), { id: (await ctx.params).id });
  const hidden = !parcel || (s.role === "merchant" && parcel.merchantId !== s.merchantId) || (s.role === "courier" && parcel.courierId !== s.userId);
  if (hidden) throw notFound("Parcel not found");
  return json({ parcel });
});
