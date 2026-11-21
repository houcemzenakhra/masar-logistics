import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { kickOutbox } from "@/lib/kick";
import { getDb } from "@/server/db";
import { deliver } from "@/server/services/delivery";

const Body = z.object({
  /** The four digits from the recipient's text message. */
  code: z.string().max(8).optional(),
  /** JPEG/PNG as a data URL or base64. Under 450 KB. */
  photo: z.string().max(700_000).optional(),
  signature: z.string().max(700_000).optional(),
  receivedBy: z.string().max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  note: z.string().max(200).optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
  /** Partial delivery (only when the order allows it): cash actually taken, and what comes back. */
  collected: z.number().int().min(0).optional(),
  returnedItems: z.string().max(200).optional(),
  at: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 5 * 60_000, "cannot be in the future").optional(),
});

/**
 * Delivers a parcel with its proof, at the door (courier) or at a stop desk (hub, code required).
 * Safe to retry with the same idempotency key.
 */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const s = await auth(req, "courier", "hub", "admin");
  const b = Body.parse(await req.json());
  const parcel = await deliver(await getDb(), { ...b, parcelId: (await ctx.params).id, actor: s });
  kickOutbox();
  return json({ parcel });
});
