import { asc, eq, sql } from "drizzle-orm";
import type { Q } from "../db";
import { communes, hubs, merchants, users, wilayas } from "../schema";

export const listWilayas = (q: Q) =>
  q
    .select({
      id: wilayas.id,
      name: wilayas.name,
      nameAr: wilayas.nameAr,
      zone: wilayas.zone,
      hubId: wilayas.hubId,
      hub: hubs.name,
      communes: sql<number>`(select count(*)::int from communes c where c.wilaya_id = wilayas.id)`,
    })
    .from(wilayas)
    .innerJoin(hubs, eq(wilayas.hubId, hubs.id))
    .orderBy(asc(wilayas.id));

export const listHubs = (q: Q) =>
  q
    .select({
      id: hubs.id,
      code: hubs.code,
      name: hubs.name,
      address: hubs.address,
      wilayas: sql<number>`(select count(*)::int from wilayas w where w.hub_id = hubs.id)`,
      onFloor: sql<number>`(select count(*)::int from parcels p where p.current_hub_id = hubs.id)`,
    })
    .from(hubs)
    .orderBy(asc(hubs.name));

export const listCouriers = (q: Q) =>
  q
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      email: users.email,
      hub: hubs.name,
      hubId: users.hubId,
      isActive: users.active,
      active: sql<number>`(select count(*)::int from parcels p where p.courier_id = users.id and p.status in ('pickup_assigned','out_for_delivery'))`,
      deliveries: sql<number>`(select count(*)::int from parcels p where p.courier_id = users.id and p.status = 'out_for_delivery')`,
    })
    .from(users)
    .leftJoin(hubs, eq(users.hubId, hubs.id))
    .where(eq(users.role, "courier"))
    .orderBy(asc(users.name));

export const listMerchants = (q: Q) =>
  q
    .select({
      id: merchants.id,
      name: merchants.name,
      phone: merchants.phone,
      wilaya: wilayas.name,
      wilayaAr: wilayas.nameAr,
      status: merchants.status,
      address: merchants.address,
      createdAt: merchants.createdAt,
      parcels: sql<number>`(select count(*)::int from parcels p where p.merchant_id = merchants.id)`,
      userId: sql<string | null>`(select u.id from users u where u.merchant_id = merchants.id order by u.created_at limit 1)`,
      email: sql<string | null>`(select u.email from users u where u.merchant_id = merchants.id order by u.created_at limit 1)`,
    })
    .from(merchants)
    .innerJoin(wilayas, eq(merchants.wilayaId, wilayas.id))
    .orderBy(asc(merchants.name));

export const listCommunes = (q: Q, wilayaId: number) =>
  q.select({ id: communes.id, name: communes.name, nameAr: communes.nameAr }).from(communes).where(eq(communes.wilayaId, wilayaId)).orderBy(asc(communes.name));
