"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/forms";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { getT } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { COOKIE_OPTS, HOME, SESSION_COOKIE, login } from "@/server/auth";
import { getDb } from "@/server/db";
import { STATUSES, type Status } from "@/server/domain/state";
import { rateTiers } from "@/server/schema";
import { assign, autoAssign, createStaff, setUserActive } from "@/server/services/dispatch";
import { handover, payout } from "@/server/services/ledger";
import { addBagsToManifest, addToBag, createBag, createManifest, departManifest, receiveBag, removeBagFromManifest, removeFromBag, sealBag } from "@/server/services/linehaul";
import { DomainError, createParcel, getParcel, hubScanTarget, transition } from "@/server/services/parcels";
import { optimiseCourierRoute } from "@/server/services/routes";
import { registerMerchant, setMerchantStatus } from "@/server/services/signup";

/** Turns expected failures into a translated message for the form; anything else still throws. */
async function guard(fn: (t: Awaited<ReturnType<typeof getT>>) => Promise<FormState | void>): Promise<FormState> {
  const t = await getT();
  try {
    return (await fn(t)) ?? {};
  } catch (e) {
    if (e instanceof z.ZodError) return { error: t(e.issues[0].message) };
    if (e instanceof DomainError) return { error: t(e.message) };
    if (e instanceof Error && /only holds|is owed|available to pay|positive whole/.test(e.message)) return { error: t(e.message) };
    throw e;
  }
}

const refresh = () => revalidatePath("/", "layout");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function setLocaleAction(fd: FormData) {
  const l = str(fd, "locale") as Locale;
  if (LOCALES.includes(l)) (await cookies()).set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  refresh();
}

// ---------- accounts ----------

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getT();
  const res = await login(str(fd, "email"), str(fd, "password"));
  if (!res) return { error: t("Wrong email or password.") };
  (await cookies()).set(SESSION_COOKIE, res.token, COOKIE_OPTS);
  redirect(HOME[res.session.role]);
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

const PHONE = /^0[5-7][\d ]{8,12}$/;
const Signup = z.object({
  businessName: z.string().trim().min(2, "Enter your shop or business name"),
  contactName: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim().regex(PHONE, "Enter a mobile number like 0550 12 34 56"),
  wilayaId: z.coerce.number().int().min(1, "Choose a wilaya"),
  communeId: z.coerce.number().int().min(1, "Choose a commune"),
  address: z.string().trim().min(4, "Enter the address or a landmark"),
  password: z.string().min(8, "Use at least 8 characters for the password"),
});

export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await guard(async () => {
    const { token } = await registerMerchant(await getDb(), Signup.parse(Object.fromEntries(fd)));
    (await cookies()).set(SESSION_COOKIE, token, COOKIE_OPTS);
  });
  if (res?.error) return res;
  redirect("/merchant");
}

export async function merchantStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole("admin");
  return guard(async () => {
    await setMerchantStatus(await getDb(), str(fd, "merchantId"), fd.get("status") === "suspended" ? "suspended" : "active");
    refresh();
  });
}

const Staff = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim(),
  role: z.enum(["admin", "hub", "courier"]),
  hubId: z.string().optional(),
  password: z.string().min(8, "Use at least 8 characters for the password"),
});

export async function createStaffAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireRole("admin");
  return guard(async (t) => {
    await createStaff(await getDb(), Staff.parse(Object.fromEntries(fd)));
    refresh();
    return { ok: t("Account created.") };
  });
}

export async function staffActiveAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async () => {
    await setUserActive(await getDb(), { userId: str(fd, "userId"), active: fd.get("active") === "1", by: s.userId });
    refresh();
  });
}

// ---------- parcels ----------

const NewParcel = z.object({
  recipientName: z.string().trim().min(2, "Enter the recipient's name"),
  recipientPhone: z.string().trim().regex(PHONE, "Enter a mobile number like 0550 12 34 56"),
  destWilayaId: z.coerce.number().int().min(1, "Choose a wilaya"),
  communeId: z.coerce.number().int().min(1, "Choose a commune"),
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
    const merchantId = s.role === "merchant" ? s.merchantId! : str(fd, "merchantId");
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
    const to = str(fd, "to") as Status;
    if (!STATUSES.includes(to)) throw new DomainError("Unknown status");
    const db = await getDb();
    const p = await transition(db, { parcelId: str(fd, "parcelId"), to, actor: s, courierId: str(fd, "courierId") || undefined, note: str(fd, "note") || undefined });
    if (to === "out_for_delivery" && p.courierId) await optimiseCourierRoute(db, p.courierId);
    refresh();
  });
}

// ---------- dispatch ----------

export async function assignAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin", "hub");
  return guard(async (t) => {
    const mode = fd.get("mode") === "pickup" ? "pickup" : "delivery";
    const db = await getDb();
    if (fd.get("auto") === "1") {
      const r = await autoAssign(db, mode, s);
      refresh();
      if (r.assigned === 0) return { error: t("Nothing could be assigned: no active courier works from the hubs these parcels are at.") };
      return { ok: t("Parcels assigned: {n}, shared among {c} couriers.", { n: r.assigned, c: r.couriers }) + (r.skipped ? ` ${t("Left waiting because their hub has no courier: {n}.", { n: r.skipped })}` : "") };
    }
    const n = await assign(db, { ids: fd.getAll("ids").map(String), courierId: str(fd, "courierId"), mode }, s);
    refresh();
    return { ok: t("Parcels assigned: {n}.", { n }) };
  });
}

export async function optimiseRouteAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("courier", "admin", "hub");
  return guard(async (t) => {
    const r = await optimiseCourierRoute(await getDb(), s.role === "courier" ? s.userId : str(fd, "courierId"));
    refresh();
    if (r.stops === 0) return { error: t("There is nothing to route yet.") };
    return { ok: t("Route planned. Stops: {s}, about {k} km in a straight line.", { s: r.stops, k: r.km }) };
  });
}

// ---------- hub ----------

export async function hubScanAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("hub", "admin");
  return guard(async (t) => {
    const db = await getDb();
    const code = str(fd, "tracking").trim().toUpperCase();
    const direction = fd.get("direction") === "out" ? "out" : "in";
    if (code.startsWith("BAG")) {
      if (direction === "out") throw new DomainError("Bags leave on a manifest. Open Linehaul to dispatch it.");
      const r = await receiveBag(db, { code }, s);
      refresh();
      return { ok: t("Bag {code} received. Parcels now at this hub: {n}.", { code: r.code, n: r.parcels }) };
    }
    const p = await getParcel(db, { tracking: code });
    if (!p) throw new DomainError("No parcel with that tracking number");
    const to = hubScanTarget(p.status as Status, direction);
    if (!to) throw new DomainError("This parcel cannot be scanned here in its current status.");
    await transition(db, { parcelId: p.id, to, actor: s });
    refresh();
    return { ok: `${p.tracking} → ${t(STATUS_TEXT[to] ?? to)}` };
  });
}

const STATUS_TEXT: Partial<Record<Status, string>> = { at_origin_hub: "At origin hub", at_destination_hub: "At destination hub", in_transit: "In transit", returned: "Returned to merchant" };

export async function bagAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("hub", "admin");
  const op = str(fd, "op");
  let go = "";
  const res = await guard(async (t) => {
    const db = await getDb();
    const bagId = str(fd, "bagId");
    if (op === "create") {
      const bag = await createBag(db, { originHubId: s.role === "hub" ? s.hubId! : str(fd, "originHubId"), destHubId: str(fd, "destHubId") }, s);
      go = `/admin/linehaul/bags/${bag.id}`;
    } else if (op === "add") {
      const tracking = str(fd, "tracking");
      const n = await addToBag(db, tracking ? { bagId, tracking } : { bagId, parcelIds: fd.getAll("ids").map(String) }, s);
      refresh();
      return { ok: t("Parcels added to the bag: {n}.", { n }) };
    } else if (op === "remove") await removeFromBag(db, { bagId, parcelId: str(fd, "parcelId") }, s);
    else if (op === "seal") await sealBag(db, bagId, s);
    else if (op === "receive") {
      const r = await receiveBag(db, { id: bagId }, s);
      refresh();
      return { ok: t("Bag {code} received. Parcels now at this hub: {n}.", { code: r.code, n: r.parcels }) };
    }
    refresh();
  });
  if (!res?.error && go) redirect(go);
  return res;
}

export async function manifestAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("hub", "admin");
  const op = str(fd, "op");
  let go = "";
  const res = await guard(async (t) => {
    const db = await getDb();
    const manifestId = str(fd, "manifestId");
    if (op === "create") {
      const m = await createManifest(db, { originHubId: s.role === "hub" ? s.hubId! : str(fd, "originHubId"), destHubId: str(fd, "destHubId"), vehicle: str(fd, "vehicle"), driver: str(fd, "driver") }, s);
      go = `/admin/linehaul/manifests/${m.id}`;
    } else if (op === "add") await addBagsToManifest(db, { manifestId, bagIds: fd.getAll("ids").map(String) }, s);
    else if (op === "remove") await removeBagFromManifest(db, { manifestId, bagId: str(fd, "bagId") }, s);
    else if (op === "depart") {
      const r = await departManifest(db, manifestId, s);
      refresh();
      return { ok: t("Departed. Bags: {b}, parcels: {n}.", { b: r.bags, n: r.parcels }) };
    }
    refresh();
  });
  if (!res?.error && go) redirect(go);
  return res;
}

// ---------- money ----------

const amount = (fd: FormData) => Number(str(fd, "amount").replace(/[\s,]/g, ""));

export async function handoverAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    await handover(await getDb(), { courierId: str(fd, "courierId"), amount: amount(fd), by: s.userId });
    refresh();
    return { ok: t("Handover recorded.") };
  });
}

export async function payoutAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    await payout(await getDb(), { merchantId: str(fd, "merchantId"), amount: amount(fd), by: s.userId });
    refresh();
    return { ok: t("Payout recorded.") };
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
  return guard(async (t) => {
    const tier = Tier.parse(Object.fromEntries(fd));
    const db = await getDb();
    await db.update(rateTiers).set({ base: tier.base, perExtraKg: tier.perExtraKg, returnFee: tier.returnFee }).where(eq(rateTiers.key, tier.key));
    refresh();
    return { ok: t("Saved. New orders use this rate.") };
  });
}
