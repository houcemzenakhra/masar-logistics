import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { registerDevice, unregisterDevice } from "@/server/services/notify";

const Body = z.object({ token: z.string().min(20).max(4096), platform: z.enum(["android", "ios", "web"]), lang: z.enum(["en", "fr", "ar"]).optional() });

/** Registers this phone for push notifications, in the app's language. */
export const POST = route(async (req) => {
  const s = await auth(req);
  await registerDevice(await getDb(), s.userId, Body.parse(await req.json()));
  return json({ ok: true });
});

/** On sign-out: stop pushing to this phone. */
export const DELETE = route(async (req) => {
  await auth(req);
  const { token } = z.object({ token: z.string() }).parse(await req.json());
  await unregisterDevice(await getDb(), token);
  return json({ ok: true });
});
