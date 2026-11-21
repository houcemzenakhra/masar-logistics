import { route } from "@/lib/api";
import { getDb } from "@/server/db";
import { listDesks } from "@/server/services/desks";

/** Open stop desks, for order forms and the public site. `?wilaya=16` narrows to one wilaya. */
export const GET = route(async (req) => {
  const w = Number(new URL(req.url).searchParams.get("wilaya"));
  const rows = await listDesks(await getDb(), { wilayaId: Number.isInteger(w) && w > 0 ? w : undefined, activeOnly: true });
  const desks = rows.map(({ active: _a, hubId: _h, ...d }) => d);
  return Response.json({ desks }, { headers: { "cache-control": "public, max-age=300" } });
});
