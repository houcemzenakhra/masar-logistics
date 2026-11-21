import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { kickOutbox } from "@/lib/kick";
import { getDb } from "@/server/db";
import { decideClaim } from "@/server/services/claims";

const Body = z.object({ approve: z.boolean(), amount: z.number().int().positive().optional(), note: z.string().max(500).optional() });

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const s = await auth(req, "admin");
  const claim = await decideClaim(await getDb(), { ...Body.parse(await req.json()), claimId: (await ctx.params).id }, s);
  kickOutbox();
  return json({ claim });
});
