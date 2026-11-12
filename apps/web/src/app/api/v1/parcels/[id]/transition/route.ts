import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { STATUSES } from "@/server/domain/state";
import { transition } from "@/server/services/parcels";

const Body = z.object({
  to: z.enum(STATUSES),
  note: z.string().max(200).optional(),
  courierId: z.string().optional(),
  /** Send the same key when retrying so the move is applied once. */
  idempotencyKey: z.string().min(8).max(80).optional(),
  /** When it happened on the device, if it is syncing late. */
  at: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 5 * 60_000, "cannot be in the future").optional(),
});

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const s = await auth(req);
  const b = Body.parse(await req.json());
  const parcel = await transition(await getDb(), { ...b, parcelId: (await ctx.params).id, actor: s });
  return json({ parcel });
});
