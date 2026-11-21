import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { merchants } from "@/server/schema";
import { setConfirmOrders } from "@/server/services/returns";

/** The merchant's order options. `confirmOrders`: new orders wait for the recipient's yes. */
export const GET = route(async (req) => {
  const s = await auth(req, "merchant");
  const [m] = await (await getDb()).select({ confirmOrders: merchants.confirmOrders }).from(merchants).where(eq(merchants.id, s.merchantId!));
  return json(m);
});

export const POST = route(async (req) => {
  const s = await auth(req, "merchant");
  const b = z.object({ confirmOrders: z.boolean() }).parse(await req.json());
  await setConfirmOrders(await getDb(), s.merchantId!, b.confirmOrders);
  return json(b);
});
