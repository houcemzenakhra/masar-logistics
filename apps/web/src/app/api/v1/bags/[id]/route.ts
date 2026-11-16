import { z } from "zod";
import { auth, json, notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { addToBag, getBag, receiveBag, removeFromBag, sealBag } from "@/server/services/linehaul";
import { listParcels } from "@/server/services/parcels";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  await auth(req, "hub", "admin");
  const db = await getDb();
  const bag = await getBag(db, (await ctx.params).id);
  if (!bag) throw notFound("Bag not found");
  return json({ bag, parcels: await listParcels(db, { bagId: bag.id }) });
});

const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), tracking: z.string().min(3) }),
  z.object({ op: z.literal("remove"), parcelId: z.string() }),
  z.object({ op: z.literal("seal") }),
  z.object({ op: z.literal("receive") }),
]);

/** One endpoint for the four things a scanner does to a bag. */
export const POST = route(async (req, ctx: Ctx) => {
  const s = await auth(req, "hub", "admin");
  const b = Body.parse(await req.json());
  const db = await getDb();
  const bagId = (await ctx.params).id;
  if (b.op === "add") await addToBag(db, { bagId, tracking: b.tracking }, s);
  else if (b.op === "remove") await removeFromBag(db, { bagId, parcelId: b.parcelId }, s);
  else if (b.op === "seal") await sealBag(db, bagId, s);
  else await receiveBag(db, { id: bagId }, s);
  return json({ bag: await getBag(db, bagId) });
});
