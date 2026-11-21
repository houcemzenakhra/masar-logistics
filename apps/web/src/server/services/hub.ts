/** What a hub team needs at a glance: the floor, bags and trucks. */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Q } from "../db";
import { bags, hubs, manifests, parcels } from "../schema";

export async function hubSummary(q: Q, hubId: string) {
  const count = (where: ReturnType<typeof and>) => q.select({ n: sql<number>`count(*)::int` }).from(parcels).where(where).then((r) => r[0].n);
  const [hub] = await q.select().from(hubs).where(eq(hubs.id, hubId));
  const [expectedIn, outbound, forDelivery, toRetry, returns, openBags, sealedBags, incoming, outgoing] = await Promise.all([
    // Picked up from merchants of this hub, or on a truck to it.
    count(or(and(eq(parcels.status, "picked_up"), eq(parcels.originHubId, hubId)), and(eq(parcels.status, "in_transit"), eq(parcels.destHubId, hubId)))),
    count(and(eq(parcels.status, "at_origin_hub"), eq(parcels.currentHubId, hubId), sql`${parcels.destHubId} <> ${hubId}`)),
    count(and(inArray(parcels.status, ["at_destination_hub", "at_origin_hub"]), eq(parcels.currentHubId, hubId), eq(parcels.destHubId, hubId))),
    count(and(eq(parcels.status, "attempt_failed"), eq(parcels.currentHubId, hubId))),
    count(and(eq(parcels.status, "return_initiated"), eq(parcels.destHubId, hubId))),
    q.select({ n: sql<number>`count(*)::int` }).from(bags).where(and(eq(bags.originHubId, hubId), eq(bags.status, "open"))).then((r) => r[0].n),
    q.select({ n: sql<number>`count(*)::int` }).from(bags).where(and(eq(bags.originHubId, hubId), eq(bags.status, "sealed"))).then((r) => r[0].n),
    q.select({ id: manifests.id, code: manifests.code, departedAt: manifests.departedAt }).from(manifests).where(and(eq(manifests.destHubId, hubId), eq(manifests.status, "departed"))),
    q.select({ id: manifests.id, code: manifests.code }).from(manifests).where(and(eq(manifests.originHubId, hubId), eq(manifests.status, "open"))),
  ]);
  return { hub: hub ? { id: hub.id, code: hub.code, name: hub.name } : null, expectedIn, outbound, forDelivery, toRetry, returns, openBags, sealedBags, incoming, outgoing };
}
