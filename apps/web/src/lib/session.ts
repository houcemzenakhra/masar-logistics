import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HOME, SESSION_COOKIE, verifySession, type Session } from "@/server/auth";
import type { Role } from "@/server/domain/state";

export async function getSession(): Promise<Session | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
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
  return getSession();
}
