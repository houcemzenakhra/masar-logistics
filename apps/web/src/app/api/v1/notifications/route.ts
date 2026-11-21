import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { inbox } from "@/server/services/notify";

export const GET = route(async (req) => {
  const s = await auth(req);
  return json(await inbox(await getDb(), s.userId));
});
