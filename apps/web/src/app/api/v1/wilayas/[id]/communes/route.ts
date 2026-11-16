import { notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { listCommunes } from "@/server/services/directory";

export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  const communes = Number.isInteger(id) ? await listCommunes(await getDb(), id) : [];
  if (communes.length === 0) throw notFound("Unknown wilaya");
  return Response.json({ communes }, { headers: { "cache-control": "public, max-age=86400" } });
});
