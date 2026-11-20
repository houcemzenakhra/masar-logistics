import { after } from "next/server";
import { getDb } from "@/server/db";
import { dispatch } from "@/server/services/sms";

/** Sends any text messages the request queued, after the response has gone out. */
export function kickSms() {
  after(async () => {
    try {
      await dispatch(await getDb());
    } catch (e) {
      console.error("SMS dispatch failed", e);
    }
  });
}
