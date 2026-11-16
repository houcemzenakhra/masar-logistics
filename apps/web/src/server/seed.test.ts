import { expect, it } from "vitest";
import { memoryDb } from "./db";
import { ledgerLines, parcels, users } from "./schema";
import { seed } from "./seed";
import { sql } from "drizzle-orm";

it("seeds a consistent demo database and does nothing the second time", async () => {
  const db = await memoryDb();
  await seed(db);
  const count = async (t: typeof parcels | typeof users) => (await db.select({ n: sql<number>`count(*)::int` }).from(t))[0].n;
  expect(await count(parcels)).toBe(46);
  const staff = await count(users);
  // Double entry: all ledger lines together sum to zero.
  const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(${ledgerLines.amount}), 0)::int` }).from(ledgerLines);
  expect(total).toBe(0);
  await seed(db);
  expect(await count(users)).toBe(staff);
  expect(await count(parcels)).toBe(46);
});
