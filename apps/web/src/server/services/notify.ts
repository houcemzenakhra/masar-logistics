/**
 * Notifications: each person's inbox, and push to their phones through Firebase Cloud Messaging.
 * Rows are written inside the transaction of the event that causes them and pushed after the
 * response, like text messages. Without Firebase settings they stay in the inbox, marked `simulated`.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { importPKCS8, SignJWT } from "jose";
import type { Q } from "../db";
import { devices, notifications, users } from "../schema";

type Lang = "en" | "fr" | "ar";
type Text = Record<Lang, [title: string, body: string]>;

export const FAIL_REASONS = ["no_answer", "absent", "refused", "wrong_address", "reschedule", "unreachable", "other"] as const;
export type FailReason = (typeof FAIL_REASONS)[number];

export const REASON_TEXT: Record<FailReason, Record<Lang, string>> = {
  no_answer: { en: "Recipient not answering", fr: "Le destinataire ne répond pas", ar: "المستلم لا يجيب" },
  absent: { en: "Recipient absent", fr: "Destinataire absent", ar: "المستلم غائب" },
  refused: { en: "Refused the parcel", fr: "Colis refusé", ar: "رفض الطرد" },
  wrong_address: { en: "Wrong address", fr: "Adresse erronée", ar: "عنوان خاطئ" },
  reschedule: { en: "Asked to come another day", fr: "Demande un autre jour", ar: "طلب يوماً آخر" },
  unreachable: { en: "Phone unreachable", fr: "Téléphone injoignable", ar: "الهاتف غير متاح" },
  other: { en: "Other reason", fr: "Autre raison", ar: "سبب آخر" },
};

const TEXTS = {
  jobs: {
    en: ["New jobs", "{n} parcels were added to your run."],
    fr: ["Nouvelles tâches", "{n} colis ont été ajoutés à votre tournée."],
    ar: ["مهام جديدة", "أضيف {n} طرد إلى جولتك."],
  },
  delivered: {
    en: ["Delivered", "{tracking} for {name} was delivered. {amount} DZD added to your balance."],
    fr: ["Livré", "{tracking} pour {name} a été livré. {amount} DA ajoutés à votre solde."],
    ar: ["تم التسليم", "تم تسليم {tracking} إلى {name}. أضيف {amount} دج إلى رصيدك."],
  },
  failed: {
    en: ["Delivery failed", "{tracking} for {name}: {reason}. Attempt {n} of {max}."],
    fr: ["Échec de livraison", "{tracking} pour {name} : {reason}. Tentative {n} sur {max}."],
    ar: ["تعذّر التسليم", "{tracking} إلى {name}: {reason}. المحاولة {n} من {max}."],
  },
  returning: {
    en: ["Coming back to you", "{tracking} for {name} is being returned: {reason}."],
    fr: ["Retour en cours", "{tracking} pour {name} vous est retourné : {reason}."],
    ar: ["في طريق العودة إليك", "يُعاد {tracking} الموجّه إلى {name}: {reason}."],
  },
  returned: {
    en: ["Returned", "{tracking} is back with you. Return fee: {fee} DZD."],
    fr: ["Retourné", "{tracking} vous a été rendu. Frais de retour : {fee} DA."],
    ar: ["تم الإرجاع", "عاد {tracking} إليك. رسوم الإرجاع: {fee} دج."],
  },
  claim_filed: {
    en: ["New claim", "{code} for {tracking}: {amount} DZD requested."],
    fr: ["Nouvelle réclamation", "{code} pour {tracking} : {amount} DA demandés."],
    ar: ["مطالبة جديدة", "{code} لـ{tracking}: مطلوب {amount} دج."],
  },
  claim_approved: {
    en: ["Claim approved", "{code}: {amount} DZD added to your balance."],
    fr: ["Réclamation acceptée", "{code} : {amount} DA ajoutés à votre solde."],
    ar: ["قُبلت المطالبة", "{code}: أضيف {amount} دج إلى رصيدك."],
  },
  claim_rejected: {
    en: ["Claim declined", "{code}: {note}"],
    fr: ["Réclamation refusée", "{code} : {note}"],
    ar: ["رُفضت المطالبة", "{code}: {note}"],
  },
  manifest: {
    en: ["Truck on its way", "{code} left {origin} with {n} bags."],
    fr: ["Camion en route", "{code} a quitté {origin} avec {n} sacs."],
    ar: ["شاحنة في الطريق", "غادر {code} {origin} ومعه {n} أكياس."],
  },
  recipient: {
    en: ["Message from a recipient", "{tracking}: {what}"],
    fr: ["Message d'un destinataire", "{tracking} : {what}"],
    ar: ["رسالة من مستلم", "{tracking}: {what}"],
  },
} satisfies Record<string, Text>;

export type NotifyKind = keyof typeof TEXTS;
type Vars = Record<string, string | number | Partial<Record<Lang, string>>>;

const fill = (tpl: string, v: Vars, lang: Lang) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const x = v[k];
    if (x == null) return "";
    if (typeof x === "object") return x[lang] ?? x.en ?? "";
    return typeof x === "number" ? new Intl.NumberFormat("en-US").format(x) : x;
  });

export function renderNotification(kind: NotifyKind, lang: Lang, vars: Vars) {
  const [title, body] = TEXTS[kind][lang];
  return { title: fill(title, vars, lang), body: fill(body, vars, lang) };
}

/**
 * Writes a notification for each person, in their language. `dedupe` makes the same event safe to
 * replay: it is suffixed with the person's id.
 */
export async function notify(q: Q, userIds: string[], kind: NotifyKind, vars: Vars, data: Record<string, string> = {}, dedupe?: string) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return 0;
  const people = await q.select({ id: users.id, lang: users.lang }).from(users).where(and(inArray(users.id, ids), eq(users.active, true)));
  if (!people.length) return 0;
  const rows = people.map((u) => ({ userId: u.id, kind, ...renderNotification(kind, u.lang, vars), data, dedupeKey: dedupe ? `${dedupe}:${u.id}` : null }));
  const out = await q.insert(notifications).values(rows).onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id });
  return out.length;
}

/** Everyone who should hear about a merchant's parcels. */
export const merchantUsers = (q: Q, merchantId: string) =>
  q.select({ id: users.id }).from(users).where(and(eq(users.merchantId, merchantId), eq(users.active, true))).then((r) => r.map((x) => x.id));

export const hubUsers = (q: Q, hubId: string) =>
  q.select({ id: users.id }).from(users).where(and(eq(users.hubId, hubId), eq(users.role, "hub"), eq(users.active, true))).then((r) => r.map((x) => x.id));

export const admins = (q: Q) =>
  q.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.active, true))).then((r) => r.map((x) => x.id));

// ---------- inbox ----------

export async function inbox(q: Q, userId: string, limit = 50) {
  const [items, [{ unread }]] = await Promise.all([
    q
      .select({ id: notifications.id, kind: notifications.kind, title: notifications.title, body: notifications.body, data: notifications.data, readAt: notifications.readAt, createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    q.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  return { items, unread };
}

export async function markRead(q: Q, userId: string, ids: string[] | "all") {
  const now = new Date();
  const where = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (ids !== "all") {
    if (!ids.length) return;
    where.push(inArray(notifications.id, ids));
  }
  await q.update(notifications).set({ readAt: now }).where(and(...where));
}

// ---------- devices ----------

export async function registerDevice(q: Q, userId: string, d: { token: string; platform: "android" | "ios" | "web"; lang?: Lang }) {
  await q
    .insert(devices)
    .values({ userId, token: d.token, platform: d.platform })
    .onConflictDoUpdate({ target: devices.token, set: { userId, platform: d.platform, updatedAt: new Date() } });
  if (d.lang) await q.update(users).set({ lang: d.lang }).where(eq(users.id, userId));
}

export const unregisterDevice = (q: Q, token: string) => q.delete(devices).where(eq(devices.token, token));

// ---------- push ----------

type Sender = { send: (token: string, n: { title: string; body: string; data: Record<string, string> }) => Promise<"ok" | "gone"> };

let cached: { token: string; exp: number } | null = null;

/**
 * Firebase settings, from the service account file:
 *   FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (the PEM, with \n for line breaks)
 * or the whole file in FCM_SERVICE_ACCOUNT.
 */
export function pushSender(): Sender | null {
  let project = process.env.FCM_PROJECT_ID;
  let email = process.env.FCM_CLIENT_EMAIL;
  let key = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (process.env.FCM_SERVICE_ACCOUNT) {
    try {
      const sa = JSON.parse(process.env.FCM_SERVICE_ACCOUNT) as { project_id: string; client_email: string; private_key: string };
      project = sa.project_id;
      email = sa.client_email;
      key = sa.private_key;
    } catch {
      return null;
    }
  }
  if (!project || !email || !key) return null;

  async function accessToken() {
    if (cached && cached.exp > Date.now() + 60_000) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(email!)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(await importPKCS8(key!, "RS256"));
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Firebase sign-in failed: ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  return {
    async send(token, n) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: n.title, body: n.body },
            data: n.data,
            android: { priority: "high", notification: { channel_id: "masar" } },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return "ok";
      const text = await res.text();
      // The app was uninstalled or the token rotated: forget it.
      if (res.status === 404 || text.includes("UNREGISTERED")) return "gone";
      throw new Error(`Firebase answered ${res.status}: ${text.slice(0, 200)}`);
    },
  };
}

/** Pushes queued notifications to each person's phones. Safe to run from several requests at once. */
export async function dispatchPush(q: Q, sender = pushSender(), limit = 100) {
  const queued = await q.update(notifications).set({ push: "sending" }).where(
    inArray(notifications.id, q.select({ id: notifications.id }).from(notifications).where(eq(notifications.push, "queued")).orderBy(notifications.createdAt).limit(limit)),
  ).returning();
  let sent = 0;
  for (const n of queued) {
    const tokens = await q.select({ token: devices.token }).from(devices).where(eq(devices.userId, n.userId));
    if (!tokens.length) {
      await q.update(notifications).set({ push: "none" }).where(eq(notifications.id, n.id));
      continue;
    }
    if (!sender) {
      await q.update(notifications).set({ push: "simulated" }).where(eq(notifications.id, n.id));
      continue;
    }
    const data = Object.fromEntries(Object.entries({ ...(n.data as Record<string, unknown>), kind: n.kind, id: n.id }).map(([k, v]) => [k, String(v)]));
    let ok = 0;
    let error: string | null = null;
    for (const { token } of tokens) {
      try {
        if ((await sender.send(token, { title: n.title, body: n.body, data })) === "gone") await unregisterDevice(q, token);
        else ok++;
      } catch (e) {
        error = (e as Error).message;
      }
    }
    await q.update(notifications).set({ push: ok > 0 ? "sent" : error ? "failed" : "none", pushError: ok > 0 ? null : error }).where(eq(notifications.id, n.id));
    if (ok) sent++;
  }
  return { sent, checked: queued.length };
}

export async function pushStats(q: Q) {
  const rows = await q
    .select({ push: notifications.push, n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(sql`${notifications.createdAt} > now() - interval '7 days'`)
    .groupBy(notifications.push);
  const [{ phones }] = await q.select({ phones: sql<number>`count(*)::int` }).from(devices);
  return { byStatus: Object.fromEntries(rows.map((r) => [r.push, r.n])) as Record<string, number>, phones, configured: pushSender() !== null };
}
