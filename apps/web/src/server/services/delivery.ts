/** Delivery at the door: proof (recipient's code, photo or signature) and the delivery itself. */
import { and, asc, eq } from "drizzle-orm";
import type { Q } from "../db";
import { checkImage } from "../images";
import { deliveryProofs, parcelEvents, parcels, settings } from "../schema";
import { DomainError, transition, type Actor } from "./parcels";

export type DeliverySettings = {
  /** `required`: a courier must record at least one proof. Operations can always deliver without. */
  proof: "optional" | "required";
};
const DEFAULTS: DeliverySettings = { proof: "optional" };

export async function getDeliverySettings(q: Q): Promise<DeliverySettings> {
  const [r] = await q.select().from(settings).where(eq(settings.key, "delivery"));
  return { ...DEFAULTS, ...((r?.value ?? {}) as Partial<DeliverySettings>) };
}

export async function setDeliverySettings(q: Q, v: DeliverySettings) {
  await q.insert(settings).values({ key: "delivery", value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
}

export type DeliverInput = {
  parcelId: string;
  actor: Actor;
  /** The four digits the recipient read from their text message. */
  code?: string;
  /** JPEG/PNG data URLs. */
  photo?: string;
  signature?: string;
  receivedBy?: string;
  lat?: number;
  lng?: number;
  note?: string;
  idempotencyKey?: string;
  at?: Date;
  /** Partial delivery: cash actually taken, and what the recipient did not keep. */
  collected?: number;
  returnedItems?: string;
};

/**
 * Marks a parcel delivered and stores the proof, in one transaction. A wrong code is refused,
 * so the courier can ask again. Replaying the same idempotency key changes nothing.
 */
export async function deliver(db: Q, input: DeliverInput) {
  const code = input.code?.replace(/\D/g, "");
  const photo = input.photo ? checkImage(input.photo, "Photo") : null;
  const signature = input.signature ? checkImage(input.signature, "Signature") : null;
  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const [seen] = await tx.select().from(parcelEvents).where(eq(parcelEvents.idempotencyKey, input.idempotencyKey));
      if (seen) return (await tx.select().from(parcels).where(eq(parcels.id, seen.parcelId)))[0];
    }
    const [p] = await tx.select().from(parcels).where(eq(parcels.id, input.parcelId));
    if (!p) throw new DomainError("Parcel not found");
    if (code && code !== p.deliveryCode) throw new DomainError("Wrong delivery code. Ask the recipient to read it again from the text message.");
    // At a stop desk anyone could ask for a parcel: the code from the text message is the proof.
    if (p.status === "ready_for_pickup" && input.actor.role !== "admin" && !code) {
      throw new DomainError("Ask for the code from the recipient's text message");
    }
    const cfg = await getDeliverySettings(tx);
    if (cfg.proof === "required" && input.actor.role !== "admin" && !code && !photo && !signature) {
      throw new DomainError("Record a proof of delivery: the recipient's code, a photo or a signature");
    }
    const updated = await transition(tx, { parcelId: p.id, to: "delivered", actor: input.actor, note: input.note, idempotencyKey: input.idempotencyKey, at: input.at, collected: input.collected, returnedItems: input.returnedItems });
    const common = { parcelId: p.id, receivedBy: input.receivedBy?.trim().slice(0, 80) ?? "", lat: input.lat ?? null, lng: input.lng ?? null, actorId: input.actor.userId, createdAt: input.at ?? new Date() };
    const rows = [
      ...(code ? [{ ...common, kind: "code" as const, image: null }] : []),
      ...(photo ? [{ ...common, kind: "photo" as const, image: photo }] : []),
      ...(signature ? [{ ...common, kind: "signature" as const, image: signature }] : []),
    ];
    if (rows.length) await tx.insert(deliveryProofs).values(rows);
    return updated;
  });
}

/** Proofs for a parcel, without the pictures themselves (fetch those one by one). */
export const listProofs = (q: Q, parcelId: string) =>
  q
    .select({ id: deliveryProofs.id, kind: deliveryProofs.kind, receivedBy: deliveryProofs.receivedBy, lat: deliveryProofs.lat, lng: deliveryProofs.lng, createdAt: deliveryProofs.createdAt })
    .from(deliveryProofs)
    .where(eq(deliveryProofs.parcelId, parcelId))
    .orderBy(asc(deliveryProofs.createdAt));

export async function proofImage(q: Q, parcelId: string, proofId: string) {
  const [r] = await q.select({ image: deliveryProofs.image }).from(deliveryProofs).where(and(eq(deliveryProofs.id, proofId), eq(deliveryProofs.parcelId, parcelId)));
  return r?.image ?? null;
}
