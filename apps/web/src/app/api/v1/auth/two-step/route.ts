import { z } from "zod";
import { fail, json, route } from "@/lib/api";
import { clientIp } from "@/lib/session";
import { sessionFor, verifyGrant } from "@/server/auth";
import { getDb } from "@/server/db";
import { LIMITS, audit, checkLimit, clearLimit, rateLimit } from "@/server/services/security";
import { checkSecondFactor } from "@/server/services/twostep";

const Body = z.object({ challenge: z.string().min(10), code: z.string().min(6).max(12) });

/** The second step of an app sign-in: the challenge from /auth/login and a code from the authenticator. */
export const POST = route(async (req) => {
  const { challenge, code } = Body.parse(await req.json());
  const userId = await verifyGrant(challenge, "2step");
  if (!userId) return fail(401, "This sign-in took too long. Enter your password again.");
  const db = await getDb();
  const ip = await clientIp();
  const limits = [LIMITS.loginAccount(`2step:${userId}`), LIMITS.loginIp(ip)];
  const limit = await checkLimit(db, limits);
  if (!limit.ok) return Response.json({ error: "Too many attempts" }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
  if (!(await checkSecondFactor(db, userId, code))) {
    await rateLimit(db, limits);
    await audit(db, { actor: null, action: "login.2step_failed", entity: "user", entityId: userId, details: { via: "api" }, ip });
    return fail(401, "That code is not right");
  }
  await clearLimit(db, LIMITS.loginAccount(`2step:${userId}`).key);
  const res = await sessionFor(userId);
  if (!res) return fail(401, "This account cannot sign in");
  await audit(db, { actor: { userId, name: res.session.name }, action: "login", entity: "user", entityId: userId, details: { via: "api", twoStep: true }, ip });
  return json({ token: res.token, user: res.session });
});
