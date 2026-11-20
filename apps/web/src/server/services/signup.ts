import { eq } from "drizzle-orm";
import { hashPassword, signSession, type Session } from "../auth";
import type { Q } from "../db";
import { communes, merchants, users, wilayas } from "../schema";
import { DomainError } from "./parcels";

export type Signup = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  wilayaId: number;
  communeId: number;
  address: string;
  password: string;
};

/** Creates a merchant in `pending` state with its first user, and signs that user in. */
export async function registerMerchant(q: Q, a: Signup): Promise<{ session: Session; token: string }> {
  const email = a.email.trim().toLowerCase();
  const session = await q.transaction(async (tx) => {
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (taken) throw new DomainError("An account with this email already exists. Sign in instead.");
    const [w] = await tx.select().from(wilayas).where(eq(wilayas.id, a.wilayaId));
    const [c] = await tx.select().from(communes).where(eq(communes.id, a.communeId));
    if (!w) throw new DomainError("Choose a wilaya");
    if (!c || c.wilayaId !== w.id) throw new DomainError("That commune is not in the chosen wilaya");
    const [m] = await tx
      .insert(merchants)
      .values({ name: a.businessName.trim(), phone: a.phone.trim(), wilayaId: w.id, address: `${a.address.trim()}, ${c.name}`, status: "pending" })
      .returning();
    const [u] = await tx
      .insert(users)
      .values({ name: a.contactName.trim(), email, phone: a.phone.trim(), role: "merchant", merchantId: m.id, passwordHash: await hashPassword(a.password) })
      .returning();
    return { userId: u.id, name: u.name, email: u.email, role: "merchant" as const, merchantId: m.id, hubId: null, ver: u.sessionVersion };
  });
  return { session, token: await signSession(session) };
}

export async function setMerchantStatus(q: Q, merchantId: string, status: "active" | "suspended") {
  const [m] = await q.update(merchants).set({ status }).where(eq(merchants.id, merchantId)).returning();
  if (!m) throw new DomainError("Merchant not found");
  return m;
}

export async function merchantStatus(q: Q, merchantId: string) {
  const [m] = await q.select({ status: merchants.status }).from(merchants).where(eq(merchants.id, merchantId));
  return m?.status ?? "active";
}
