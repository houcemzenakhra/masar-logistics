"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/forms";
import { requireRole } from "@/lib/session";
import { COOKIE_OPTS, HOME, SESSION_COOKIE, login } from "@/server/auth";
import { getDb } from "@/server/db";
import { STATUSES, type Status } from "@/server/domain/state";
import { rateTiers } from "@/server/schema";
import { handover, payout } from "@/server/services/ledger";
import { DomainError, createParcel, getParcel, hubScanTarget, transition } from "@/server/services/parcels";
import { eq } from "drizzle-orm";

/** Turns expected failures into a message for the form; anything else still throws. */
async function guard(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    if (e instanceof DomainError || e instanceof z.ZodError) {
      return { error: e instanceof z.ZodError ? e.issues[0].message : e.message };
    }
    if (e instanceof Error && /only holds|is owed|available to pay|positive whole/.test(e.message)) return { error: e.message };
    throw e;
  }
}

const refresh = () => revalidatePath("/", "layout");

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (!res) return { error: "Wrong email or password." };
  (await cookies()).set(SESSION_COOKIE, res.token, COOKIE_OPTS);
  redirect(HOME[res.session.role]);
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

const NewParcel = z.object({
  recipientName: z.string().trim().min(2, "Enter the recipient's name"),
  recipientPhone: z.string().trim().regex(/^0[5-7][\d ]{8,12}$/, "Enter a mobile number like 0550 12 34 56"),
  destWilayaId: z.coerce.number().int().min(1, "Choose a wilaya").max(58),
  commune: z.string().trim().min(2, "Enter the commune"),
  address: z.string().trim().min(4, "Enter the address or a landmark"),
  description: z.string().trim().max(120).optional(),
  weightKg: z.coerce.number().min(0.1, "Weight must be above 0").max(70, "Maximum weight is 70 kg"),
  codAmount: z.coerce.number().int("COD must be a whole number of dinars").min(0).max(2_000_000),
});

export async function createParcelAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("merchant", "admin");
  let id = "";
  const res = await guard(async () => {
    const input = NewParcel.parse(Object.fromEntries(fd));
    const merchantId = s.role === "merchant" ? s.merchantId! : String(fd.get("merchantId") ?? "");
    if (!merchantId) throw new DomainError("Choose a merchant");
    const p = await createParcel(await getDb(), { ...input, weightKg: Math.ceil(input.weightKg), merchantId }, s);
    id = p.id;
  });
  if (res?.error) return res;
  refresh();
  redirect(s.role === "merchant" ? `/merchant/parcels/${id}` : `/admin/parcels/${id}`);
}

export async function transitionAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin", "hub", "courier", "merchant");
  return guard(async () => {
    const to = String(fd.get("to")) as Status;
    if (!STATUSES.includes(to)) throw new DomainError("Unknown status");
    await transition(await getDb(), {
      parcelId: String(fd.get("parcelId")),
      to,
      actor: s,
      courierId: (fd.get("courierId") as string) || undefined,
      note: (fd.get("note") as string) || undefined,
    });
    refresh();
  });
}

/** Dispatch board: assign many parcels to one courier for pickup or for delivery. */
export async function assignAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin", "hub");
  return guard(async () => {
    const ids = fd.getAll("ids").map(String);
    const courierId = String(fd.get("courierId") ?? "");
    const to = fd.get("mode") === "pickup" ? "pickup_assigned" : "out_for_delivery";
    if (ids.length === 0) throw new DomainError("Tick at least one parcel");
    if (!courierId) throw new DomainError("Choose a courier");
    const db = await getDb();
    for (const parcelId of ids) await transition(db, { parcelId, to, actor: s, courierId });
    refresh();
    return { ok: `${ids.length} parcel${ids.length > 1 ? "s" : ""} assigned.` };
  });
}

export async function hubScanAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("hub", "admin");
  return guard(async () => {
    const db = await getDb();
    const p = await getParcel(db, { tracking: String(fd.get("tracking") ?? "") });
    if (!p) throw new DomainError("No parcel with that tracking number");
    const direction = fd.get("direction") === "out" ? "out" : "in";
    const to = hubScanTarget(p.status as Status, direction);
    if (!to) throw new DomainError(`${p.tracking} is "${p.status.replaceAll("_", " ")}": nothing to scan ${direction} here`);
    await transition(db, { parcelId: p.id, to, actor: s });
    refresh();
    return { ok: `${p.tracking} → ${to.replaceAll("_", " ")}` };
  });
}

const amount = (fd: FormData) => Number(String(fd.get("amount") ?? "").replace(/[\s,]/g, ""));

export async function handoverAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async () => {
    await handover(await getDb(), { courierId: String(fd.get("courierId")), amount: amount(fd), by: s.userId });
    refresh();
    return { ok: "Handover recorded." };
  });
}

export async function payoutAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async () => {
    await payout(await getDb(), { merchantId: String(fd.get("merchantId")), amount: amount(fd), by: s.userId });
    refresh();
    return { ok: "Payout recorded." };
  });
}

const Tier = z.object({
  key: z.enum(["local", "north", "highlands", "south"]),
  base: z.coerce.number().int().min(0).max(100000),
  perExtraKg: z.coerce.number().int().min(0).max(10000),
  returnFee: z.coerce.number().int().min(0).max(100000),
});

export async function updateTierAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole("admin");
  return guard(async () => {
    const t = Tier.parse(Object.fromEntries(fd));
    const db = await getDb();
    await db.update(rateTiers).set({ base: t.base, perExtraKg: t.perExtraKg, returnFee: t.returnFee }).where(eq(rateTiers.key, t.key));
    refresh();
    return { ok: "Saved. New orders use this rate." };
  });
}
