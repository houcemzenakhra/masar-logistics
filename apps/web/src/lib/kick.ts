import { after } from "next/server";
import { getDb } from "@/server/db";
import { dispatchPush } from "@/server/services/notify";
import { dispatchWebhooks } from "@/server/services/integrations";
import { dispatch } from "@/server/services/sms";

/**
 * Sends what the request queued (text messages, push notifications, webhooks) after the response has
 * gone out, so the person who acted does not wait for the gateways.
 */
export function kickSms() {
  after(async () => {
    const db = await getDb();
    await Promise.all([
      dispatch(db).catch((e) => console.error("SMS dispatch failed", e)),
      dispatchPush(db).catch((e) => console.error("Push dispatch failed", e)),
      dispatchWebhooks(db).catch((e) => console.error("Webhook dispatch failed", e)),
    ]);
  });
}

export const kickOutbox = kickSms;
