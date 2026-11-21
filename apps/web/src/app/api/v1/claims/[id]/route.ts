import { auth, json, notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { getClaim } from "@/server/services/claims";

export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const s = await auth(req, "merchant", "admin");
  const claim = await getClaim(await getDb(), (await ctx.params).id);
  if (!claim || (s.role === "merchant" && claim.merchantId !== s.merchantId)) throw notFound("Claim not found");
  return json({ claim });
});
