import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { merchants } from "@/server/schema";
import { MIN_PAYOUT, listPayoutRequests, payoutAvailable, requestPayout } from "@/server/services/money";

export const GET = route(async (req) => {
  const s = await auth(req, "merchant");
  const db = await getDb();
  const [[m], avail, requests] = await Promise.all([db.select().from(merchants).where(eq(merchants.id, s.merchantId!)), payoutAvailable(db, s.merchantId!), listPayoutRequests(db, { merchantId: s.merchantId })]);
  return json({
    ...avail,
    minimum: MIN_PAYOUT,
    account: m.payoutMethod ? { method: m.payoutMethod, account: m.payoutAccount, holder: m.payoutHolder } : null,
    requests,
  });
});

const Body = z.object({ amount: z.number().int().positive() });

export const POST = route(async (req) => {
  const s = await auth(req, "merchant");
  const request = await requestPayout(await getDb(), s.merchantId!, Body.parse(await req.json()).amount, s);
  return json({ request }, 201);
});
