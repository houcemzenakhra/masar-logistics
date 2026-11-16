import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { optimiseCourierRoute } from "@/server/services/routes";

/** Re-plans the signed-in courier's delivery order. `GET /courier/tasks` then returns it in that order. */
export const POST = route(async (req) => {
  const s = await auth(req, "courier");
  return json(await optimiseCourierRoute(await getDb(), s.userId));
});
