import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./domain/state";
import { getDb, schema } from "./db";

export type Session = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  merchantId: string | null;
  hubId: string | null;
};

export const SESSION_COOKIE = "masar_session";
const WEEK = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return new TextEncoder().encode(s ?? "masar-dev-secret-change-me");
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${WEEK}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const p = payload as unknown as Session;
    return { userId: p.userId, name: p.name, email: p.email, role: p.role, merchantId: p.merchantId, hubId: p.hubId };
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<{ session: Session; token: string } | null> {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  if (!u || !u.active) return null;
  if (!(await bcrypt.compare(password, u.passwordHash))) return null;
  const session: Session = {
    userId: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    merchantId: u.merchantId,
    hubId: u.hubId,
  };
  return { session, token: await signSession(session) };
}

export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: WEEK,
};

export const HOME: Record<Role, string> = {
  admin: "/admin",
  hub: "/admin/scan",
  merchant: "/merchant",
  courier: "/courier",
};
