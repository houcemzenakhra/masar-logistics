import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import type { StaffRole } from "@/lib/staff";
import type { Role } from "./domain/state";
import { getDb, schema, type Q } from "./db";

export type Session = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  merchantId: string | null;
  hubId: string | null;
  /** The account's session version when this session was issued. */
  ver: number;
  /** Operations staff: which areas they work in. */
  staffRole?: StaffRole;
  /** Two-step sign-in is on for this account. */
  twoStep?: boolean;
};

export const SESSION_COOKIE = "masar_session";
const WEEK = 60 * 60 * 24 * 7;

/** True on a deployment backed by a real database: no development defaults are allowed there. */
export const isDeployed = () => Boolean(process.env.DATABASE_URL) && process.env.NODE_ENV === "production";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && isDeployed()) throw new Error("AUTH_SECRET must be set");
  if (s && s.length < 32 && isDeployed()) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s ?? "masar-dev-secret-change-me");
}

/** A short-lived signed value for something other than a session, e.g. a recipient's tracking access. */
export async function signGrant(purpose: string, subject: string, seconds: number) {
  return new SignJWT({ p: purpose }).setProtectedHeader({ alg: "HS256" }).setSubject(subject).setIssuedAt().setExpirationTime(`${seconds}s`).sign(secret());
}

export async function verifyGrant(token: string | undefined, purpose: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.p === purpose && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

let DUMMY: string | undefined;

export const hashPassword = (p: string) => bcrypt.hash(p, 10);

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${WEEK}s`)
    .sign(secret());
}

/**
 * Checks the token's signature, then the account: it must still be active and its session version
 * unchanged, so a password change or a deactivation signs out every device at once.
 * Name, role and hub are read fresh, so changes apply without signing in again.
 */
export async function verifySession(token: string | undefined | null, q?: Q): Promise<Session | null> {
  if (!token) return null;
  let p: Partial<Session>;
  try {
    p = (await jwtVerify(token, secret())).payload as Partial<Session>;
  } catch {
    return null;
  }
  if (!p.userId) return null;
  const db = q ?? (await getDb());
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, p.userId));
  if (!u || !u.active || u.sessionVersion !== (p.ver ?? 0)) return null;
  return toSession(u);
}

function toSession(u: typeof schema.users.$inferSelect): Session {
  return { userId: u.id, name: u.name, email: u.email, role: u.role, merchantId: u.merchantId, hubId: u.hubId, ver: u.sessionVersion, staffRole: u.staffRole, twoStep: !!u.totpEnabledAt };
}

/** Checks a password. Rate limits are applied by the caller, which knows the client's address. */
export async function login(email: string, password: string): Promise<{ session: Session; token: string } | null> {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  // Compare against a dummy hash when there is no account, so both cases take the same time.
  const ok = await bcrypt.compare(password, u?.passwordHash ?? (DUMMY ??= bcrypt.hashSync("no-such-account", 10)));
  if (!u || !u.active || !ok) return null;
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  const session = toSession(u);
  return { session, token: await signSession(session) };
}

/** A full session for an account, after its second step was checked. */
export async function sessionFor(userId: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u || !u.active) return null;
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  const session = toSession(u);
  return { session, token: await signSession(session) };
}

/** Holds the account between the password and the code: five minutes, this browser only. */
export const TWO_STEP_COOKIE = "masar_2step";

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
