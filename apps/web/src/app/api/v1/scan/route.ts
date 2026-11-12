import { z } from "zod";
import { auth, json, notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import type { Status } from "@/server/domain/state";
import { DomainError, getParcel, hubScanTarget, transition } from "@/server/services/parcels";

const Body = z.object({ tracking: z.string().min(3), direction: z.enum(["in", "out"]), idempotencyKey: z.string().min(8).max(80).optional() });

/** Hub scan: the server works out the move from the parcel's current status. */
export const POST = route(async (req) => {
  const s = await auth(req, "hub", "admin");
  const b = Body.parse(await req.json());
  const db = await getDb();
  const p = await getParcel(db, { tracking: b.tracking });
  if (!p) throw notFound("No parcel with that tracking number");
  const to = hubScanTarget(p.status as Status, b.direction);
  if (!to) throw new DomainError(`${p.tracking} is "${p.status}": nothing to scan ${b.direction} here`);
  const parcel = await transition(db, { parcelId: p.id, to, actor: s, idempotencyKey: b.idempotencyKey });
  return json({ parcel });
});
