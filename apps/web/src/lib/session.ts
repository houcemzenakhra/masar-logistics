import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { initLocale } from "@/lib/i18n";
import { HOME, SESSION_COOKIE, verifySession, type Session } from "@/server/auth";
import type { Role } from "@/server/domain/state";
import { getDb } from "@/server/db";
import { looksLikeApiKey, verifyApiKey } from "@/server/services/integrations";
import { getSecurityPolicy } from "@/server/services/twostep";
import { canUse, type Area } from "./staff";

// One database check per request, however many components ask for the session.
const cookieSession = cache(async () => verifySession((await cookies()).get(SESSION_COOKIE)?.value));

export async function getSession(): Promise<Session | null> {
  await initLocale();
  return cookieSession();
}

/** The visitor's address as reported by the hosting proxy, for rate limits and the audit log. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Base URL for links sent by text message or email. */
export async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

/** For pages and server actions: returns the session or sends the visitor away. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!roles.includes(s.role)) redirect(HOME[s.role]);
  await requireTwoStepIfStaff(s);
  return s;
}

/** When operations require it, staff without two-step sign-in go to turn it on first. */
async function requireTwoStepIfStaff(s: Session) {
  if ((s.role !== "admin" && s.role !== "hub") || s.twoStep) return;
  if ((await getSecurityPolicy(await getDb())).requireStaff2fa) redirect("/account/security?required=1");
}

/**
 * An operations page or action in one area. Staff with a narrower role (finance, dispatch,
 * support) are sent back to the overview for areas outside theirs; `others` lets hub or other
 * roles in too, as with requireRole.
 */
export async function requireStaff(area: Area, ...others: Role[]): Promise<Session> {
  const s = await requireRole("admin", ...others);
  if (s.role === "admin" && !canUse(s.staffRole, area)) redirect(`/admin?denied=${area}`);
  return s;
}

/** Any signed-in account, before the two-step rule: the page where people turn it on. */
export async function requireSignedIn(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** For /api/v1 route handlers: cookie or `Authorization: Bearer <token>`. */
export async function apiSession(req: Request): Promise<Session | null> {
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) {
    const token = h.slice(7).trim();
    // A merchant's API key (msr_live_…) for shops and scripts; otherwise an app session.
    if (looksLikeApiKey(token)) return verifyApiKey(await getDb(), token);
    return verifySession(token);
  }
  return cookieSession();
}
