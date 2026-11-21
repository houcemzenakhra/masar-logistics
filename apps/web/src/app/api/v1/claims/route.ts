import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { kickOutbox } from "@/lib/kick";
import { getDb } from "@/server/db";
import { CLAIM_KINDS, fileClaim, listClaims } from "@/server/services/claims";

export const GET = route(async (req) => {
  const s = await auth(req, "merchant", "admin");
  const status = new URL(req.url).searchParams.get("status");
  const claims = await listClaims(await getDb(), {
    merchantId: s.role === "merchant" ? s.merchantId : undefined,
    status: status === "open" || status === "approved" || status === "rejected" ? status : undefined,
  });
  return json({ claims });
});

const Body = z.object({
  parcelId: z.string().optional(),
  tracking: z.string().optional(),
  kind: z.enum(CLAIM_KINDS),
  description: z.string().max(1000),
  amount: z.number().int().positive(),
  /** Up to 6 photos, JPEG/PNG data URLs under 450 KB each. */
  photos: z.array(z.string().max(700_000)).max(6).optional(),
});

export const POST = route(async (req) => {
  const s = await auth(req, "merchant", "admin");
  const claim = await fileClaim(await getDb(), Body.parse(await req.json()), s);
  kickOutbox();
  return json({ claim }, 201);
});
