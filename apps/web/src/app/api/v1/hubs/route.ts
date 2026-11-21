import { json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { listHubs } from "@/server/services/directory";

/** Public: the hubs, for choosing where a bag or truck goes. */
export const GET = route(async () => {
  const hubs = await listHubs(await getDb());
  return json({ hubs: hubs.map((h) => ({ id: h.id, code: h.code, name: h.name, address: h.address, wilayas: h.wilayas })) });
});
