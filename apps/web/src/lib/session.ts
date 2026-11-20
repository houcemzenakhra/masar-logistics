import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { initLocale } from "@/lib/i18n";
import { HOME, SESSION_COOKIE, verifySession, type Session } from "@/server/auth";
import type { Role } from "@/server/domain/state";

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
  return s;
}

/** For /api/v1 route handlers: cookie or `Authorization: Bearer <token>`. */
export async function apiSession(req: Request): Promise<Session | null> {
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return verifySession(h.slice(7));
  return cookieSession();
}
