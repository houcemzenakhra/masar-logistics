import { z } from "zod";
import { json, route } from "@/lib/api";
import { clientIp } from "@/lib/session";
import { getDb } from "@/server/db";
import { normalizeMobile } from "@/server/phone";
import { LIMITS, audit, rateLimit } from "@/server/services/security";
import { registerMerchant } from "@/server/services/signup";

const Body = z.object({
  businessName: z.string().trim().min(2),
  contactName: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().refine((p) => normalizeMobile(p) !== null, "must be an Algerian mobile number"),
  wilayaId: z.number().int().min(1),
  communeId: z.number().int().min(1),
  address: z.string().trim().min(4),
  password: z.string().min(8),
});

/** Merchant self-signup. The account starts as pending until an admin approves it. */
export const POST = route(async (req) => {
  const db = await getDb();
  const ip = await clientIp();
  const limit = await rateLimit(db, [LIMITS.signupIp(ip)]);
  if (!limit.ok) return Response.json({ error: "Too many attempts" }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
  const b = Body.parse(await req.json());
  const res = await registerMerchant(db, { ...b, phone: normalizeMobile(b.phone)! });
  await audit(db, { actor: { userId: res.session.userId, name: res.session.name }, action: "merchant.signup", entity: "merchant", entityId: res.session.merchantId, details: { via: "api" }, ip });
  return json({ token: res.token, user: res.session, status: "pending" }, 201);
});
