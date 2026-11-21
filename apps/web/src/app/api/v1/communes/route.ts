import { json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { searchCommunes } from "@/server/services/directory";

/** Public commune search: GET /api/v1/communes?q=bab%20ez. At least 2 characters. */
export const GET = route(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  const communes = await searchCommunes(await getDb(), q);
  return json({ communes }, 200);
});
