import { json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { listWilayas } from "@/server/services/directory";
import { getTiers } from "@/server/services/parcels";

export const GET = route(async () => {
  const db = await getDb();
  const [wilayas, tiers] = await Promise.all([listWilayas(db), getTiers(db)]);
  return json({ wilayas, tiers });
});
