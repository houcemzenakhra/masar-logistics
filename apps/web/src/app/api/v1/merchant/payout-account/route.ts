import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { setPayoutDetails } from "@/server/services/money";

const Body = z.object({ method: z.enum(["ccp", "bank"]), account: z.string().max(40), holder: z.string().max(80) });

export const POST = route(async (req) => {
  const s = await auth(req, "merchant");
  await setPayoutDetails(await getDb(), s.merchantId!, Body.parse(await req.json()));
  return json({ ok: true });
});
