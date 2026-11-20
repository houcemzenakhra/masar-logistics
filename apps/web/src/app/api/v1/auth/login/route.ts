import { z } from "zod";
import { fail, json, route } from "@/lib/api";
import { clientIp } from "@/lib/session";
import { login } from "@/server/auth";
import { getDb } from "@/server/db";
import { LIMITS, audit, checkLimit, clearLimit, rateLimit } from "@/server/services/security";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = route(async (req) => {
  const { email, password } = Body.parse(await req.json());
  const db = await getDb();
  const ip = await clientIp();
  const limits = [LIMITS.loginAccount(email), LIMITS.loginIp(ip)];
  const limit = await checkLimit(db, limits);
  if (!limit.ok) return Response.json({ error: "Too many attempts" }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
  const res = await login(email, password);
  if (!res) {
    await rateLimit(db, limits);
    await audit(db, { actor: null, action: "login.failed", entity: "user", details: { email: email.toLowerCase(), via: "api" }, ip });
    return fail(401, "Wrong email or password");
  }
  await clearLimit(db, LIMITS.loginAccount(email).key);
  await audit(db, { actor: { userId: res.session.userId, name: res.session.name }, action: "login", entity: "user", entityId: res.session.userId, details: { via: "api" }, ip });
  return json({ token: res.token, user: res.session });
});
