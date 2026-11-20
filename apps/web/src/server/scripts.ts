/**
 * Database commands for a real Postgres set in DATABASE_URL:
 *
 *   npm run db:migrate     apply migrations
 *   npm run db:seed        reference data (hubs, 69 wilayas, 1,541 communes, rates) and a first
 *                          operations account from ADMIN_EMAIL and ADMIN_PASSWORD
 *   npm run db:seed:demo   reference data and the demo accounts and parcels, with the password
 *                          in MASAR_DEMO_PASSWORD. For staging only.
 *
 * DATABASE_URL_UNPOOLED, when set, is used instead of DATABASE_URL. All three are safe to run again.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { DB } from "./db";
import * as schema from "./schema";
import { seed, seedProduction } from "./seed";

function need(name: string, min = 1) {
  const v = process.env[name];
  if (!v || v.length < min) throw new Error(`Set ${name}${min > 1 ? ` (at least ${min} characters)` : ""}`);
  return v;
}

async function main() {
  // Migrations need a direct connection; a pooled one in transaction mode can break them.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || need("DATABASE_URL"), max: 2 });
  const db = drizzle(pool, { schema }) as unknown as DB;
  const cmd = process.argv[2];
  if (cmd === "migrate") await migrate(drizzle(pool, { schema }), { migrationsFolder: "drizzle" });
  else if (cmd === "seed") {
    const created = await seedProduction(db, { email: need("ADMIN_EMAIL"), password: need("ADMIN_PASSWORD", 12) });
    console.log(created ? "First operations account created." : "Accounts already exist: none created.");
  } else if (cmd === "seed-demo") await seed(db, need("MASAR_DEMO_PASSWORD", 12));
  else throw new Error("Usage: scripts.ts migrate | seed | seed-demo");
  await pool.end();
  console.log(`${cmd}: done`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
