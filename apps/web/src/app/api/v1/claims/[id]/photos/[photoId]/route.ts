import { auth, notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { imageResponse } from "@/server/images";
import { claimPhoto, getClaim } from "@/server/services/claims";

export const GET = route(async (req, ctx: { params: Promise<{ id: string; photoId: string }> }) => {
  const s = await auth(req, "merchant", "admin");
  const { id, photoId } = await ctx.params;
  const db = await getDb();
  const c = await getClaim(db, id);
  if (!c || (s.role === "merchant" && c.merchantId !== s.merchantId)) throw notFound("Not found");
  return imageResponse(await claimPhoto(db, id, photoId));
});
