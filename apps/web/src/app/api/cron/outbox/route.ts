import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db";
import { alertOnProblems } from "@/server/services/health";
import { dispatchWebhooks } from "@/server/services/integrations";
import { dispatchPush } from "@/server/services/notify";
import { dispatch } from "@/server/services/sms";

/**
 * Sends whatever is waiting: text messages, push notifications, and webhook retries that came
 * due while nothing else was happening. Then runs the health checks and alerts operations. Called by a scheduler with `Authorization: Bearer
 * $CRON_SECRET` (Vercel Cron sends it). Without CRON_SECRET set, the endpoint is off.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return Response.json({ error: "Not allowed" }, { status: 401 });
  const db = await getDb();
  const [sms, push, webhooks] = await Promise.all([dispatch(db), dispatchPush(db), dispatchWebhooks(db, { limit: 200 })]);
  // Health checks run with it, and operations hear about problems (once a day each).
  const alerts = await alertOnProblems(db);
  await dispatchPush(db);
  return Response.json({ sms, push, webhooks, alerts });
}
