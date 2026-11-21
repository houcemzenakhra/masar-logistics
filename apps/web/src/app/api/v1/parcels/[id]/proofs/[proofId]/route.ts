import { auth, notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { imageResponse } from "@/server/images";
import { proofImage } from "@/server/services/delivery";
import { getParcel } from "@/server/services/parcels";

/** The photo or signature taken at delivery. Visible to operations, the merchant and the courier. */
export const GET = route(async (req, ctx: { params: Promise<{ id: string; proofId: string }> }) => {
  const s = await auth(req);
  const { id, proofId } = await ctx.params;
  const db = await getDb();
  const p = await getParcel(db, { id });
  if (!p || (s.role === "merchant" && p.merchantId !== s.merchantId) || (s.role === "courier" && p.courierId !== s.userId)) throw notFound("Not found");
  return imageResponse(await proofImage(db, id, proofId));
});
