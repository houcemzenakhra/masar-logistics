import { z } from "zod";
import { json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { registerMerchant } from "@/server/services/signup";

const Body = z.object({
  businessName: z.string().trim().min(2),
  contactName: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^0[5-7][\d ]{8,12}$/),
  wilayaId: z.number().int().min(1),
  communeId: z.number().int().min(1),
  address: z.string().trim().min(4),
  password: z.string().min(8),
});

/** Merchant self-signup. The account starts as pending until an admin approves it. */
export const POST = route(async (req) => {
  const res = await registerMerchant(await getDb(), Body.parse(await req.json()));
  return json({ token: res.token, user: res.session, status: "pending" }, 201);
});
