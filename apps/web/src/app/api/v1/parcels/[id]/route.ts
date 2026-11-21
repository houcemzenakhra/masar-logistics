import { auth, json, notFound, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { listClaims } from "@/server/services/claims";
import { listProofs } from "@/server/services/delivery";
import { getParcel } from "@/server/services/parcels";
import { listRequests } from "@/server/services/recipient";
import { linkedParcels, recipientHistory } from "@/server/services/returns";

/** One parcel with its history, proof of delivery, recipient requests and claims. */
export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const s = await auth(req);
  const db = await getDb();
  const parcel = await getParcel(db, { id: (await ctx.params).id });
  const hidden = !parcel || (s.role === "merchant" && parcel.merchantId !== s.merchantId) || (s.role === "courier" && parcel.courierId !== s.userId);
  if (hidden) throw notFound("Parcel not found");
  const [proofs, requests, claims, history, linked] = await Promise.all([
    listProofs(db, parcel.id),
    s.role === "merchant" ? Promise.resolve([]) : listRequests(db, parcel.id),
    s.role === "courier" ? Promise.resolve([]) : listClaims(db, { merchantId: parcel.merchantId }).then((c) => c.filter((x) => x.parcelId === parcel.id)),
    recipientHistory(db, parcel.id, s),
    linkedParcels(db, parcel),
  ]);
  /** `history`: counts of the recipient's past orders (null when off, none, or for couriers). */
  return json({ parcel, proofs, requests, claims, history, returnLegs: linked.legs, returnOf: linked.parent });
});
