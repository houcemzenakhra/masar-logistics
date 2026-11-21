import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { listHandovers } from "@/server/services/money";

/** The courier's own cash receipts. */
export const GET = route(async (req) => {
  const s = await auth(req, "courier");
  return json({ handovers: (await listHandovers(await getDb(), { courierId: s.userId })).slice(0, 30) });
});
