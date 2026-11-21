import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { markRead } from "@/server/services/notify";

const Body = z.object({ ids: z.union([z.array(z.string()).max(200), z.literal("all")]) });

export const POST = route(async (req) => {
  const s = await auth(req);
  await markRead(await getDb(), s.userId, Body.parse(await req.json()).ids);
  return json({ ok: true });
});
