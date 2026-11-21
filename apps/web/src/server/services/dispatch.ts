import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { hashPassword } from "../auth";
import type { StaffRole } from "@/lib/staff";
import type { Q } from "../db";
import { hubs, parcels, users } from "../schema";
import { notify } from "./notify";
import { DomainError, transition, type Actor } from "./parcels";
import { pickupDueSql } from "./pickups";
import { optimiseCourierRoute } from "./routes";

/** Today in Algeria, YYYY-MM-DD. */
export const algeriaToday = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(d);

/**
 * Parcels waiting for a courier: new orders to pick up, or parcels at their destination hub.
 * A parcel whose recipient asked for a later day waits until that day.
 */
export async function waiting(q: Q, mode: "pickup" | "delivery") {
  if (mode === "pickup") {
    // An order waiting for the recipient's confirmation is not picked up yet.
    // Nor is one whose merchant has no pickup today (regular days or a booking).
    return q.select({ id: parcels.id, hubId: parcels.originHubId }).from(parcels).where(and(eq(parcels.status, "created"), ne(parcels.confirmation, "pending"), pickupDueSql(algeriaToday())));
  }
  return q
    .select({ id: parcels.id, hubId: parcels.destHubId })
    .from(parcels)
    .where(
      sql`(${parcels.status} in ('at_destination_hub', 'attempt_failed') or (${parcels.status} = 'at_origin_hub' and ${parcels.originHubId} = ${parcels.destHubId} and ${parcels.bagId} is null)) and ${parcels.deliveryType} = 'home' and (${parcels.preferredDate} is null or ${parcels.preferredDate} <= ${algeriaToday()})`,
    );
}

/** Assigns chosen parcels to one courier, then re-plans that courier's delivery route. */
export async function assign(q: Q, a: { ids: string[]; courierId: string; mode: "pickup" | "delivery" }, actor: Actor) {
  if (a.ids.length === 0) throw new DomainError("Tick at least one parcel");
  if (!a.courierId) throw new DomainError("Choose a courier");
  return q.transaction(async (tx) => {
    const to = a.mode === "pickup" ? "pickup_assigned" : "out_for_delivery";
    for (const parcelId of a.ids) await transition(tx, { parcelId, to, actor, courierId: a.courierId });
    if (a.mode === "delivery") await optimiseCourierRoute(tx, a.courierId);
    await notify(tx, [a.courierId], "jobs", { n: a.ids.length }, { mode: a.mode });
    return a.ids.length;
  });
}

/**
 * Shares every waiting parcel among the active couriers of its hub, always giving the next
 * parcel to the courier with the fewest jobs. Parcels at a hub with no courier are left waiting.
 */
export async function autoAssign(q: Q, mode: "pickup" | "delivery", actor: Actor) {
  return q.transaction(async (tx) => {
    const todo = await waiting(tx, mode);
    const couriers = await tx
      .select({
        id: users.id,
        hubId: users.hubId,
        load: sql<number>`(select count(*)::int from parcels p where p.courier_id = users.id and p.status in ('pickup_assigned','out_for_delivery'))`,
      })
      .from(users)
      .where(and(eq(users.role, "courier"), eq(users.active, true)));
    const to = mode === "pickup" ? "pickup_assigned" : "out_for_delivery";
    const touched = new Set<string>();
    const given = new Map<string, number>();
    let assigned = 0;
    for (const p of todo) {
      const pool = couriers.filter((c) => c.hubId === p.hubId).sort((a, b) => a.load - b.load);
      if (pool.length === 0) continue;
      await transition(tx, { parcelId: p.id, to, actor, courierId: pool[0].id });
      pool[0].load++;
      touched.add(pool[0].id);
      given.set(pool[0].id, (given.get(pool[0].id) ?? 0) + 1);
      assigned++;
    }
    if (mode === "delivery") for (const id of touched) await optimiseCourierRoute(tx, id);
    for (const [id, n] of given) await notify(tx, [id], "jobs", { n }, { mode });
    return { assigned, skipped: todo.length - assigned, couriers: touched.size };
  });
}

export async function createStaff(q: Q, a: { name: string; email: string; phone: string; role: "admin" | "hub" | "courier"; staffRole?: StaffRole; hubId?: string; password: string }) {
  const email = a.email.trim().toLowerCase();
  const [taken] = await q.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken) throw new DomainError("An account with this email already exists");
  if (a.role !== "admin") {
    const [h] = a.hubId ? await q.select().from(hubs).where(eq(hubs.id, a.hubId)) : [];
    if (!h) throw new DomainError("Choose the hub this person works from");
  }
  const [u] = await q
    .insert(users)
    .values({ name: a.name.trim(), email, phone: a.phone.trim(), role: a.role, staffRole: a.role === "admin" ? (a.staffRole ?? "owner") : "owner", hubId: a.role === "admin" ? null : a.hubId, passwordHash: await hashPassword(a.password) })
    .returning();
  return u;
}

export async function setStaffRole(q: Q, userId: string, staffRole: StaffRole) {
  const [u] = await q.update(users).set({ staffRole }).where(and(eq(users.id, userId), eq(users.role, "admin"))).returning();
  if (!u) throw new DomainError("Only operations accounts have a staff role");
  return u;
}

export async function setUserActive(q: Q, a: { userId: string; active: boolean; by: string }) {
  if (a.userId === a.by) throw new DomainError("You cannot deactivate your own account");
  if (!a.active) {
    const [{ n }] = await q
      .select({ n: sql<number>`count(*)::int` })
      .from(parcels)
      .where(and(eq(parcels.courierId, a.userId), inArray(parcels.status, ["pickup_assigned", "out_for_delivery"])));
    if (n > 0) throw new DomainError(`This courier still has ${n} active parcels. Reassign them first.`);
  }
  await q.update(users).set({ active: a.active }).where(eq(users.id, a.userId));
}

export const listStaff = (q: Q) =>
  q
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, staffRole: users.staffRole, twoStep: users.totpEnabledAt, active: users.active, hub: hubs.name })
    .from(users)
    .leftJoin(hubs, eq(users.hubId, hubs.id))
    .where(inArray(users.role, ["admin", "hub", "courier"]))
    .orderBy(users.role, users.name);
