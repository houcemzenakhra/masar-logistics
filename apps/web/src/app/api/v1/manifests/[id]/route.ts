import { z } from "zod";
import { auth, json, notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { addBagsToManifest, departManifest, getManifest, listBags, removeBagFromManifest } from "@/server/services/linehaul";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  await auth(req, "hub", "admin");
  const db = await getDb();
  const manifest = await getManifest(db, (await ctx.params).id);
  if (!manifest) throw notFound("Manifest not found");
  return json({ manifest, bags: await listBags(db, { manifestId: manifest.id }) });
});

const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), bagIds: z.array(z.string()).min(1) }),
  z.object({ op: z.literal("remove"), bagId: z.string() }),
  z.object({ op: z.literal("depart") }),
]);

export const POST = route(async (req, ctx: Ctx) => {
  const s = await auth(req, "hub", "admin");
  const b = Body.parse(await req.json());
  const db = await getDb();
  const manifestId = (await ctx.params).id;
  if (b.op === "add") await addBagsToManifest(db, { manifestId, bagIds: b.bagIds }, s);
  else if (b.op === "remove") await removeBagFromManifest(db, { manifestId, bagId: b.bagId }, s);
  else await departManifest(db, manifestId, s);
  return json({ manifest: await getManifest(db, manifestId) });
});
