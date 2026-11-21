import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { kickOutbox } from "@/lib/kick";
import { getDb } from "@/server/db";
import { listHandovers, receiveCash } from "@/server/services/money";

export const GET = route(async (req) => {
  const s = await auth(req, "hub", "admin");
  return json({ handovers: await listHandovers(await getDb(), { hubId: s.role === "hub" ? s.hubId : null }) });
});

const Body = z.object({ courierId: z.string(), counted: z.number().int().min(0), note: z.string().max(300).optional() });

/** Cash counted from a courier. Returns the receipt; its page is /receipt/{id}. */
export const POST = route(async (req) => {
  const s = await auth(req, "hub", "admin");
  const handover = await receiveCash(await getDb(), Body.parse(await req.json()), s);
  kickOutbox();
  return json({ handover }, 201);
});
