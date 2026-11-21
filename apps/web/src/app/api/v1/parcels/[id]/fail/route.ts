import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { kickOutbox } from "@/lib/kick";
import { getDb } from "@/server/db";
import { FAIL_REASONS, transition } from "@/server/services/parcels";

const Body = z.object({
  reason: z.enum(FAIL_REASONS),
  note: z.string().max(200).optional(),
  /** With reason `reschedule`: YYYY-MM-DD. */
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
  at: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 5 * 60_000, "cannot be in the future").optional(),
});

/** Records a failed delivery attempt. `refused` sends the parcel back to the merchant at once. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const s = await auth(req, "courier", "admin");
  const b = Body.parse(await req.json());
  const parcel = await transition(await getDb(), { ...b, to: "attempt_failed", parcelId: (await ctx.params).id, actor: s });
  kickOutbox();
  return json({ parcel });
});
