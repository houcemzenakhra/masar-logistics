/**
 * Claims for lost or damaged parcels. The merchant files one with photos; operations approve an
 * amount (at most the parcel's value) or decline it. An approved claim is paid into the merchant's
 * wallet through the ledger, from the claims expense account.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Q } from "../db";
import { checkImage } from "../images";
import { claimPhotos, claims, merchants, parcels } from "../schema";
import { acct, post } from "./ledger";
import { admins, merchantUsers, notify } from "./notify";
import { DomainError, type Actor } from "./parcels";

export const CLAIM_KINDS = ["lost", "damaged", "missing_items"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/** Damage must be reported soon after delivery or return. */
export const CLAIM_WINDOW_DAYS = 7;
/** When a parcel had no cash on delivery, its value is unknown: claims are capped at this. */
export const NO_COD_CAP = 5000;
export const EXPENSE_CLAIMS = "expense:claims";

export const claimCap = (p: { codAmount: number }) => (p.codAmount > 0 ? p.codAmount : NO_COD_CAP);

/** Whether a parcel can be claimed for, and why not. */
export function claimable(p: { status: string; updatedAt: Date; deliveredAt: Date | null }, kind: ClaimKind, now = new Date()): string | null {
  if (kind === "lost") {
    if (p.status === "lost") return null;
    // A parcel stuck with no scan for two weeks can be claimed as lost too.
    if (!["delivered", "returned", "cancelled"].includes(p.status) && now.getTime() - p.updatedAt.getTime() > 14 * 86400_000) return null;
    return "A parcel can be claimed as lost once operations mark it lost, or after 14 days without any scan.";
  }
  if (p.status !== "delivered" && p.status !== "returned") return "Damage can be claimed once the parcel is delivered or back with you.";
  const when = p.deliveredAt ?? p.updatedAt;
  if (now.getTime() - when.getTime() > CLAIM_WINDOW_DAYS * 86400_000) return `Damage must be claimed within ${CLAIM_WINDOW_DAYS} days.`;
  return null;
}

function newCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return `CLM-${String(n).padStart(6, "0")}`;
}

export async function fileClaim(
  db: Q,
  input: { parcelId?: string; tracking?: string; kind: ClaimKind; description: string; amount: number; photos?: string[] },
  actor: Actor,
) {
  if (actor.role !== "merchant" && actor.role !== "admin") throw new DomainError("Only merchants can file claims");
  const description = input.description.trim();
  if (description.length < 10) throw new DomainError("Describe what happened in a sentence or two");
  const photos = (input.photos ?? []).slice(0, 6).map((p, i) => checkImage(p, `Photo ${i + 1}`));
  if (input.kind !== "lost" && photos.length === 0) throw new DomainError("Add at least one photo of the damage");
  return db.transaction(async (tx) => {
    const where = input.parcelId ? eq(parcels.id, input.parcelId) : eq(parcels.tracking, (input.tracking ?? "").trim().toUpperCase());
    const [p] = await tx.select().from(parcels).where(where);
    if (!p) throw new DomainError("No parcel with that tracking number");
    if (actor.role === "merchant" && p.merchantId !== actor.merchantId) throw new DomainError("No parcel with that tracking number");
    const why = claimable(p, input.kind);
    if (why) throw new DomainError(why);
    const [dup] = await tx.select({ code: claims.code }).from(claims).where(and(eq(claims.parcelId, p.id), inArray(claims.status, ["open", "approved"])));
    if (dup) throw new DomainError(`This parcel already has claim ${dup.code}`);
    const cap = claimCap(p);
    const amount = Math.round(input.amount);
    if (!(amount > 0)) throw new DomainError("Enter the amount you are claiming");
    if (amount > cap) throw new DomainError(`The most you can claim for this parcel is ${cap} DZD`);
    const [c] = await tx
      .insert(claims)
      .values({ code: newCode(), parcelId: p.id, merchantId: p.merchantId, kind: input.kind, description: description.slice(0, 1000), amountRequested: amount, createdBy: actor.userId })
      .returning();
    if (photos.length) await tx.insert(claimPhotos).values(photos.map((image) => ({ claimId: c.id, image })));
    await notify(tx, await admins(tx), "claim_filed", { code: c.code, tracking: p.tracking, amount }, { claimId: c.id });
    return c;
  });
}

export async function decideClaim(db: Q, input: { claimId: string; approve: boolean; amount?: number; note?: string }, actor: Actor) {
  if (actor.role !== "admin") throw new DomainError("Only operations can decide claims");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(claims).where(eq(claims.id, input.claimId)).for("update");
    if (!c) throw new DomainError("Claim not found");
    if (c.status !== "open") throw new DomainError("This claim has already been decided");
    const [p] = await tx.select().from(parcels).where(eq(parcels.id, c.parcelId));
    const note = input.note?.trim() ?? "";
    const people = await merchantUsers(tx, c.merchantId);
    if (!input.approve) {
      if (!note) throw new DomainError("Say why the claim is declined: the merchant will read it");
      const [d] = await tx.update(claims).set({ status: "rejected", decisionNote: note, decidedBy: actor.userId, decidedAt: new Date() }).where(eq(claims.id, c.id)).returning();
      await notify(tx, people, "claim_rejected", { code: c.code, note }, { claimId: c.id });
      return d;
    }
    const amount = Math.round(input.amount ?? c.amountRequested);
    if (!(amount > 0)) throw new DomainError("Enter the amount to pay");
    if (amount > claimCap(p)) throw new DomainError(`At most ${claimCap(p)} DZD can be paid for this parcel`);
    await post(tx, {
      kind: "claim",
      parcelId: p.id,
      memo: `Claim payment ${p.tracking}`,
      createdBy: actor.userId,
      lines: [
        { account: EXPENSE_CLAIMS, amount },
        { account: acct.merchant(c.merchantId), amount: -amount },
      ],
    });
    const [d] = await tx
      .update(claims)
      .set({ status: "approved", amountApproved: amount, decisionNote: note, decidedBy: actor.userId, decidedAt: new Date() })
      .where(eq(claims.id, c.id))
      .returning();
    await notify(tx, people, "claim_approved", { code: c.code, amount }, { claimId: c.id });
    return d;
  });
}

export async function listClaims(q: Q, f: { id?: string; merchantId?: string | null; status?: "open" | "approved" | "rejected" } = {}) {
  return q
    .select({
      id: claims.id,
      code: claims.code,
      kind: claims.kind,
      status: claims.status,
      amountRequested: claims.amountRequested,
      amountApproved: claims.amountApproved,
      description: claims.description,
      decisionNote: claims.decisionNote,
      createdAt: claims.createdAt,
      decidedAt: claims.decidedAt,
      parcelId: parcels.id,
      tracking: parcels.tracking,
      recipient: parcels.recipientName,
      codAmount: parcels.codAmount,
      merchant: merchants.name,
      photos: sql<number>`(select count(*)::int from claim_photos cp where cp.claim_id = ${claims.id})`,
    })
    .from(claims)
    .innerJoin(parcels, eq(claims.parcelId, parcels.id))
    .innerJoin(merchants, eq(claims.merchantId, merchants.id))
    .where(and(f.id ? eq(claims.id, f.id) : undefined, f.merchantId ? eq(claims.merchantId, f.merchantId) : undefined, f.status ? eq(claims.status, f.status) : undefined))
    .orderBy(desc(claims.createdAt))
    .limit(300);
}

export async function getClaim(q: Q, id: string) {
  const [c] = await listClaims(q, { id });
  if (!c) return null;
  const photos = await q.select({ id: claimPhotos.id }).from(claimPhotos).where(eq(claimPhotos.claimId, id));
  const [row] = await q.select({ merchantId: claims.merchantId }).from(claims).where(eq(claims.id, id));
  return { ...c, merchantId: row.merchantId, photoIds: photos.map((p) => p.id), cap: claimCap(c) };
}

export async function claimPhoto(q: Q, claimId: string, photoId: string) {
  const [r] = await q.select({ image: claimPhotos.image }).from(claimPhotos).where(and(eq(claimPhotos.id, photoId), eq(claimPhotos.claimId, claimId)));
  return r?.image ?? null;
}
