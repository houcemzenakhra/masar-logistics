import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { courierCash } from "@/server/services/ledger";
import { listParcels } from "@/server/services/parcels";

export const GET = route(async (req) => {
  const s = await auth(req, "courier");
  const db = await getDb();
  const [tasks, cash] = await Promise.all([listParcels(db, { courierId: s.userId, status: ["pickup_assigned", "out_for_delivery"] }), courierCash(db, s.userId)]);
  return json({
    cashToHandOver: cash,
    pickups: tasks.filter((t) => t.status === "pickup_assigned"),
    deliveries: tasks.filter((t) => t.status === "out_for_delivery"),
  });
});
