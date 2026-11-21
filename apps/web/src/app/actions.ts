"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/forms";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { getT, locale } from "@/lib/i18n";
import { kickSms } from "@/lib/kick";
import { baseUrl, clientIp, requireRole } from "@/lib/session";
import { RECIPIENT_COOKIE, recipientParcelId } from "@/lib/recipient";
import { COOKIE_OPTS, HOME, SESSION_COOKIE, login, signGrant, type Session } from "@/server/auth";
import { getDb } from "@/server/db";
import { STATUSES, type Status } from "@/server/domain/state";
import { maskPhone, normalizeMobile } from "@/server/phone";
import { rateTiers, users } from "@/server/schema";
import { assign, autoAssign, createStaff, setUserActive } from "@/server/services/dispatch";
import { handover, payout } from "@/server/services/ledger";
import { addBagsToManifest, addToBag, createBag, createManifest, departManifest, receiveBag, removeBagFromManifest, removeFromBag, sealBag } from "@/server/services/linehaul";
import { ImportHeaderError, commitBatch, discardBatch, stageImport } from "@/server/services/imports";
import { sendMail } from "@/server/services/mail";
import { CLAIM_KINDS, decideClaim, fileClaim } from "@/server/services/claims";
import { deliver, setDeliverySettings } from "@/server/services/delivery";
import { cancelPayout, createBatch, markBatchPaid, receiveCash, recordPay, removeFromBatch, requestPayout, resolveShortfall, setCompany, setPayRates, setPayoutDetails } from "@/server/services/money";
import { DomainError, FAIL_REASONS, createParcel, getParcel, hubScanTarget, transition, type FailReason } from "@/server/services/parcels";
import { rate, reschedule, setInstructions, verifyRecipient } from "@/server/services/recipient";
import { optimiseCourierRoute } from "@/server/services/routes";
import { LIMITS, audit, checkLimit, clearLimit, createResetToken, rateLimit, resetPassword } from "@/server/services/security";
import { registerMerchant, setMerchantStatus } from "@/server/services/signup";
import { PARCEL_KINDS, dispatch, queueSms, renderResetSms, setSmsSettings } from "@/server/services/sms";

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

const kick = kickSms;

/** Writes an audit entry for the signed-in person. */
async function log(s: Session | null, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}) {
  await audit(await getDb(), { actor: s && { userId: s.userId, name: s.name }, action, entity, entityId, details, ip: await clientIp() });
}

function tooMany(t: (s: string, v?: Record<string, string | number>) => string, seconds: number): FormState {
  return { error: t("Too many attempts. Try again in {n} minutes.", { n: Math.ceil(seconds / 60) }) };
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function setLocaleAction(fd: FormData) {
  const l = str(fd, "locale") as Locale;
  if (LOCALES.includes(l)) (await cookies()).set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  refresh();
}

// ---------- accounts ----------

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getT();
  const email = str(fd, "email").trim().toLowerCase();
  const db = await getDb();
  const ip = await clientIp();
  const limits = [LIMITS.loginAccount(email), LIMITS.loginIp(ip)];
  const limit = await checkLimit(db, limits);
  if (!limit.ok) return tooMany(t, limit.retryAfter);
  const res = await login(email, str(fd, "password"));
  if (!res) {
    const after = await rateLimit(db, limits);
    if (!after.ok) return tooMany(t, after.retryAfter);
    await audit(db, { actor: null, action: "login.failed", entity: "user", details: { email }, ip });
    return { error: t("Wrong email or password.") };
  }
  await clearLimit(db, LIMITS.loginAccount(email).key);
  await audit(db, { actor: { userId: res.session.userId, name: res.session.name }, action: "login", entity: "user", entityId: res.session.userId, ip });
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
  const t = await getT();
  const db = await getDb();
  const limit = await rateLimit(db, [LIMITS.signupIp(await clientIp())]);
  if (!limit.ok) return tooMany(t, limit.retryAfter);
  const res = await guard(async () => {
    const input = Signup.parse(Object.fromEntries(fd));
    const { token, session } = await registerMerchant(db, { ...input, phone: normalizeMobile(input.phone) ?? input.phone });
    await log(session, "merchant.signup", "merchant", session.merchantId, { business: input.businessName });
    (await cookies()).set(SESSION_COOKIE, token, COOKIE_OPTS);
  });
  if (res?.error) return res;
  redirect("/merchant");
}

/** Sends a reset link by SMS (and by email when configured). Always answers the same way, so it does not reveal which emails have accounts. */
export async function forgotAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getT();
  const db = await getDb();
  const ip = await clientIp();
  const email = str(fd, "email").trim().toLowerCase();
  const done: FormState = { ok: t("If an account uses this email, we have sent it a link to choose a new password. It is valid for 1 hour.") };
  const limit = await rateLimit(db, [LIMITS.resetIp(ip)]);
  if (!limit.ok) return tooMany(t, limit.retryAfter);
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u || !u.active) return done;
  if (!(await rateLimit(db, [LIMITS.resetAccount(u.id)])).ok) return done;
  const { token, hours } = await createResetToken(db, u.id, null);
  const link = `${await baseUrl()}/reset/${token}`;
  const lang = locale() === "ar" ? "ar" : "fr";
  if (u.phone) await queueSms(db, { to: u.phone, body: renderResetSms(lang, link, hours), kind: "password_reset", userId: u.id });
  await sendMail({ to: u.email, subject: "Masar: nouveau mot de passe / New password", text: `${renderResetSms("fr", link, hours)}\n\n${link}` });
  await audit(db, { actor: null, action: "password.reset_requested", entity: "user", entityId: u.id, ip });
  kick();
  return done;
}

export async function resetAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getT();
  if (str(fd, "password") !== str(fd, "confirm")) return { error: t("The two passwords are different.") };
  const res = await guard(async () => {
    const db = await getDb();
    const u = await resetPassword(db, str(fd, "token"), str(fd, "password"));
    await audit(db, { actor: { userId: u.userId, name: u.name }, action: "password.reset", entity: "user", entityId: u.userId, ip: await clientIp() });
  });
  if (res?.error) return res;
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login?reset=1");
}

/** An admin makes a reset link for someone who cannot receive it, e.g. to send by WhatsApp. */
export async function resetLinkAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    const db = await getDb();
    const [u] = await db.select().from(users).where(eq(users.id, str(fd, "userId")));
    if (!u) throw new DomainError("Unknown account");
    const { token, hours } = await createResetToken(db, u.id, s.userId);
    const link = `${await baseUrl()}/reset/${token}`;
    const phone = normalizeMobile(u.phone);
    if (phone) await queueSms(db, { to: phone, body: renderResetSms(locale() === "ar" ? "ar" : "fr", link, hours), kind: "password_reset", userId: u.id });
    await log(s, "password.reset_link", "user", u.id, { email: u.email });
    kick();
    return { ok: `${t("Reset link for {name}, valid {h} hours:", { name: u.name, h: hours })} ${link}${phone ? ` — ${t("also sent by SMS to {p}", { p: maskPhone(phone) })}` : ""}` };
  });
}

export async function merchantStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async () => {
    const status = fd.get("status") === "suspended" ? "suspended" : "active";
    const m = await setMerchantStatus(await getDb(), str(fd, "merchantId"), status);
    await log(s, status === "active" ? "merchant.approve" : "merchant.suspend", "merchant", m.id, { name: m.name });
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
  const s = await requireRole("admin");
  return guard(async (t) => {
    const input = Staff.parse(Object.fromEntries(fd));
    const u = await createStaff(await getDb(), { ...input, phone: normalizeMobile(input.phone) ?? input.phone });
    await log(s, "staff.create", "user", u.id, { email: u.email, role: u.role });
    refresh();
    return { ok: t("Account created.") };
  });
}

export async function staffActiveAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async () => {
    const active = fd.get("active") === "1";
    await setUserActive(await getDb(), { userId: str(fd, "userId"), active, by: s.userId });
    await log(s, active ? "staff.reactivate" : "staff.deactivate", "user", str(fd, "userId"));
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
  recipientLang: z.enum(["fr", "ar"]).default("fr"),
});

export async function createParcelAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("merchant", "admin");
  let id = "";
  const res = await guard(async () => {
    const input = NewParcel.parse(Object.fromEntries(fd));
    const merchantId = s.role === "merchant" ? s.merchantId! : str(fd, "merchantId");
    if (!merchantId) throw new DomainError("Choose a merchant");
    const p = await createParcel(await getDb(), { ...input, recipientPhone: normalizeMobile(input.recipientPhone) ?? input.recipientPhone, weightKg: Math.ceil(input.weightKg), merchantId }, s);
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
    const reason = str(fd, "reason") as FailReason;
    const p = await transition(db, {
      parcelId: str(fd, "parcelId"),
      to,
      actor: s,
      courierId: str(fd, "courierId") || undefined,
      note: str(fd, "note") || undefined,
      reason: to === "attempt_failed" ? (FAIL_REASONS.includes(reason) ? reason : "other") : undefined,
      preferredDate: str(fd, "preferredDate") || undefined,
    });
    if (to === "out_for_delivery" && p.courierId) await optimiseCourierRoute(db, p.courierId);
    if (to === "lost" || to === "cancelled") await log(s, `parcel.${to}`, "parcel", p.id, { tracking: p.tracking });
    kick();
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
      kick();
      refresh();
      if (r.assigned === 0) return { error: t("Nothing could be assigned: no active courier works from the hubs these parcels are at.") };
      return { ok: t("Parcels assigned: {n}, shared among {c} couriers.", { n: r.assigned, c: r.couriers }) + (r.skipped ? ` ${t("Left waiting because their hub has no courier: {n}.", { n: r.skipped })}` : "") };
    }
    const n = await assign(db, { ids: fd.getAll("ids").map(String), courierId: str(fd, "courierId"), mode }, s);
    kick();
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
    await log(s, "ledger.handover", "user", str(fd, "courierId"), { amount: amount(fd) });
    refresh();
    return { ok: t("Handover recorded.") };
  });
}

export async function payoutAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    await payout(await getDb(), { merchantId: str(fd, "merchantId"), amount: amount(fd), by: s.userId });
    await log(s, "ledger.payout", "merchant", str(fd, "merchantId"), { amount: amount(fd) });
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
  const s = await requireRole("admin");
  return guard(async (t) => {
    const tier = Tier.parse(Object.fromEntries(fd));
    const db = await getDb();
    const [before] = await db.select().from(rateTiers).where(eq(rateTiers.key, tier.key));
    await db.update(rateTiers).set({ base: tier.base, perExtraKg: tier.perExtraKg, returnFee: tier.returnFee }).where(eq(rateTiers.key, tier.key));
    await log(s, "pricing.update", "rate_tier", tier.key, { before: { base: before.base, perExtraKg: before.perExtraKg, returnFee: before.returnFee }, after: { base: tier.base, perExtraKg: tier.perExtraKg, returnFee: tier.returnFee } });
    refresh();
    return { ok: t("Saved. New orders use this rate.") };
  });
}

// ---------- bulk import ----------

export async function importUploadAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("merchant");
  let id = "";
  const t = await getT();
  const db = await getDb();
  if (!(await rateLimit(db, [LIMITS.importMerchant(s.merchantId!)])).ok) return { error: t("Too many uploads in the last hour. Try again later.") };
  const res = await guard(async () => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("Choose a file to upload.");
    try {
      const b = await stageImport(db, { merchantId: s.merchantId!, userId: s.userId, file: { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) } });
      id = b.id;
    } catch (e) {
      if (e instanceof ImportHeaderError) {
        return { error: t("The first row must name the columns. Missing: {cols}. Download the template to see the expected columns.", { cols: e.missing.map((m) => t(COLUMN[m])).join(", ") }) };
      }
      throw e;
    }
  });
  if (res?.error) return res;
  redirect(`/merchant/import/${id}`);
}

const COLUMN: Record<string, string> = { name: "Name", phone: "Phone", wilaya: "Wilaya", commune: "Commune", address: "Address", cod: "COD" };

export async function importCommitAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("merchant");
  const res = await guard(async () => {
    const n = await commitBatch(await getDb(), str(fd, "batchId"), s);
    await log(s, "import.commit", "import", str(fd, "batchId"), { created: n });
  });
  if (res?.error) return res;
  refresh();
  redirect(`/merchant/import/${str(fd, "batchId")}`);
}

export async function importDiscardAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("merchant");
  await discardBatch(await getDb(), str(fd, "batchId"), s.merchantId!);
  redirect("/merchant/import");
}

// ---------- text messages ----------

export async function smsSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    const enabled = Object.fromEntries(PARCEL_KINDS.map((k) => [k, fd.get(k) === "on"])) as Record<(typeof PARCEL_KINDS)[number], boolean>;
    await setSmsSettings(await getDb(), { enabled });
    await log(s, "sms.settings", "settings", "sms", { enabled });
    refresh();
    return { ok: t("Saved.") };
  });
}

export async function smsRetryAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    const ids = fd.getAll("ids").map(String);
    const r = await dispatch(await getDb(), { retry: true, limit: 200, ids: ids.length ? ids : undefined });
    await log(s, "sms.retry", "sms", null, r);
    refresh();
    return { ok: t("Messages processed: {n}. Sent: {s}. Failed: {f}.", { n: r.claimed, s: r.sent + r.simulated, f: r.failed }) };
  });
}

export async function smsTestAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  const t = await getT();
  const db = await getDb();
  if (!(await rateLimit(db, [LIMITS.smsTest(s.userId)])).ok) return { error: t("Too many test messages. Try again later.") };
  return guard(async () => {
    const to = normalizeMobile(str(fd, "to"));
    if (!to) throw new DomainError("Enter a mobile number like 0550 12 34 56");
    const m = await queueSms(db, { to, body: str(fd, "lang") === "ar" ? "مسار: رسالة تجريبية. الإعدادات تعمل." : "Masar: message de test. La configuration fonctionne.", kind: "test", userId: s.userId });
    const r = await dispatch(db, { ids: [m!.id] });
    await log(s, "sms.test", "sms", m!.id, { to: maskPhone(to) });
    refresh();
    if (r.failed) return { error: t("The gateway refused the message. See the error in the list below.") };
    return { ok: r.simulated ? t("Recorded in test mode: no SMS provider is configured, so nothing was sent.") : t("Sent to {p}.", { p: to }) };
  });
}


// ---------- delivery with proof ----------

export async function deliverAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("courier", "admin");
  return guard(async () => {
    await deliver(await getDb(), {
      parcelId: str(fd, "parcelId"),
      actor: s,
      code: str(fd, "code") || undefined,
      photo: str(fd, "photos") || undefined,
      receivedBy: str(fd, "receivedBy") || undefined,
    });
    kick();
    refresh();
  });
}

export async function deliverySettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    const proof = fd.get("proof") === "required" ? "required" : "optional";
    await setDeliverySettings(await getDb(), { proof });
    await log(s, "settings.delivery", "settings", "delivery", { proof });
    refresh();
    return { ok: t("Saved.") };
  });
}

// ---------- claims ----------

export async function fileClaimAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("merchant");
  let id = "";
  const res = await guard(async () => {
    const kind = str(fd, "kind") as (typeof CLAIM_KINDS)[number];
    if (!CLAIM_KINDS.includes(kind)) throw new DomainError("Choose what happened");
    const c = await fileClaim(
      await getDb(),
      { tracking: str(fd, "tracking"), kind, description: str(fd, "description"), amount: Number(str(fd, "amount")), photos: fd.getAll("photos").map(String).filter(Boolean) },
      s,
    );
    await log(s, "claim.filed", "claim", c.id, { code: c.code });
    kick();
    id = c.id;
  });
  if (id) redirect(`/merchant/claims/${id}`);
  return res;
}

export async function decideClaimAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    const approve = fd.get("decision") === "approve";
    const c = await decideClaim(await getDb(), { claimId: str(fd, "claimId"), approve, amount: approve ? Number(str(fd, "amount")) : undefined, note: str(fd, "note") }, s);
    await log(s, approve ? "claim.approved" : "claim.rejected", "claim", c.id, { code: c.code, amount: c.amountApproved });
    kick();
    refresh();
    return { ok: approve ? t("Approved. The amount is in the merchant's wallet.") : t("Declined. The merchant has been told why.") };
  });
}

// ---------- recipient, from the tracking page ----------

export async function recipientVerifyAction(_: FormState, fd: FormData): Promise<FormState> {
  return guard(async () => {
    const tracking = str(fd, "tracking").toUpperCase();
    const id = await verifyRecipient(await getDb(), tracking, str(fd, "last4"));
    (await cookies()).set(RECIPIENT_COOKIE(tracking), await signGrant("recipient", id, 2 * 3600), { ...COOKIE_OPTS, maxAge: 2 * 3600 });
    refresh();
  });
}

async function recipientGuard(fd: FormData) {
  const tracking = str(fd, "tracking");
  const id = await recipientParcelId(tracking);
  if (!id) throw new DomainError("Confirm the last four digits of your phone number first");
  const p = await getParcel(await getDb(), { tracking });
  if (!p || p.id !== id) throw new DomainError("Confirm the last four digits of your phone number first");
  return id;
}

export async function recipientRescheduleAction(_: FormState, fd: FormData): Promise<FormState> {
  return guard(async (t) => {
    await reschedule(await getDb(), await recipientGuard(fd), str(fd, "day"));
    kick();
    refresh();
    return { ok: t("Done. We will bring it on the day you chose.") };
  });
}

export async function recipientInstructionsAction(_: FormState, fd: FormData): Promise<FormState> {
  return guard(async (t) => {
    await setInstructions(await getDb(), await recipientGuard(fd), str(fd, "instructions"));
    kick();
    refresh();
    return { ok: t("Saved. The courier will see your note.") };
  });
}

export async function recipientRateAction(_: FormState, fd: FormData): Promise<FormState> {
  return guard(async (t) => {
    await rate(await getDb(), await recipientGuard(fd), Number(str(fd, "stars")), str(fd, "comment"));
    refresh();
    return { ok: t("Thank you for your rating.") };
  });
}

// ---------- money: payouts, cash checks, courier pay, company details ----------

export async function payoutDetailsAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("merchant");
  return guard(async (t) => {
    await setPayoutDetails(await getDb(), s.merchantId!, {
      method: fd.get("method") === "bank" ? "bank" : "ccp",
      account: str(fd, "account"),
      holder: str(fd, "holder"),
      legalName: str(fd, "legalName"),
      nif: str(fd, "nif"),
      rc: str(fd, "rc"),
    });
    await log(s, "merchant.payout_details", "merchant", s.merchantId!, {});
    refresh();
    return { ok: t("Saved. Payouts go to this account from now on.") };
  });
}

export async function requestPayoutAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("merchant");
  return guard(async (t) => {
    const r = await requestPayout(await getDb(), s.merchantId!, amount(fd), s);
    await log(s, "payout.requested", "payout", r.id, { amount: r.amount });
    refresh();
    return { ok: t("Requested. Finance sends transfers in batches, usually within two working days.") };
  });
}

export async function cancelPayoutAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("merchant", "admin");
  return guard(async () => {
    await cancelPayout(await getDb(), str(fd, "id"), s, str(fd, "note"));
    await log(s, s.role === "admin" ? "payout.rejected" : "payout.cancelled", "payout", str(fd, "id"), {});
    refresh();
  });
}

export async function createBatchAction(): Promise<FormState> {
  const s = await requireRole("admin");
  let id = "";
  const res = await guard(async () => {
    const b = await createBatch(await getDb(), s);
    await log(s, "payout.batch_created", "batch", b.id, { total: b.total, count: b.count });
    id = b.id;
  });
  if (id) redirect(`/admin/finance/payouts/${id}`);
  return res;
}

export async function markBatchPaidAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    const b = await markBatchPaid(await getDb(), str(fd, "batchId"), str(fd, "reference"), s);
    await log(s, "payout.batch_paid", "batch", b.id, { total: b.total, reference: b.reference });
    kick();
    refresh();
    return { ok: t("Marked paid. Merchants have been told.") };
  });
}

export async function removeFromBatchAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async () => {
    await removeFromBatch(await getDb(), str(fd, "id"));
    await log(s, "payout.removed_from_batch", "payout", str(fd, "id"), {});
    refresh();
  });
}

export async function receiveCashAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin", "hub");
  let id = "";
  const res = await guard(async () => {
    const h = await receiveCash(await getDb(), { courierId: str(fd, "courierId"), counted: amount(fd), note: str(fd, "note") }, s);
    await log(s, "cash.received", "handover", h.id, { expected: h.expected, counted: h.counted });
    kick();
    id = h.id;
  });
  if (id) redirect(`/receipt/${id}`);
  return res;
}

export async function resolveShortfallAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async () => {
    const how = str(fd, "how");
    if (how !== "repaid" && how !== "written_off" && how !== "deducted") throw new DomainError("Choose how the shortfall is settled");
    await resolveShortfall(await getDb(), str(fd, "id"), how, s);
    await log(s, `cash.shortfall_${how}`, "handover", str(fd, "id"), {});
    refresh();
  });
}

export async function recordPayAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    const r = await recordPay(await getDb(), str(fd, "month"), str(fd, "courierId"), s);
    await log(s, "courier.pay_recorded", "user", str(fd, "courierId"), { month: r.month, total: r.total });
    refresh();
    return { ok: t("Pay recorded.") };
  });
}

export async function payRatesAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    const n = (k: string) => Number(str(fd, k));
    const v = { perDelivery: n("perDelivery"), perPickup: n("perPickup"), bonusThreshold: n("bonusThreshold"), bonus: n("bonus") };
    await setPayRates(await getDb(), v);
    await log(s, "settings.courier_pay", "settings", "courierPay", v);
    refresh();
    return { ok: t("Saved.") };
  });
}

export async function companyAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireRole("admin");
  return guard(async (t) => {
    const v = { legalName: str(fd, "legalName"), address: str(fd, "address"), nif: str(fd, "nif"), rc: str(fd, "rc"), nis: str(fd, "nis"), ai: str(fd, "ai"), phone: str(fd, "phone"), email: str(fd, "email") };
    if (!v.legalName) throw new DomainError("Enter the company's legal name");
    await setCompany(await getDb(), v);
    await log(s, "settings.company", "settings", "company", {});
    refresh();
    return { ok: t("Saved.") };
  });
}
