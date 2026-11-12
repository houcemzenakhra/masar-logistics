/** `npm run db:migrate` and `npm run db:seed`, for a real Postgres set in DATABASE_URL. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { DB } from "./db";
import * as schema from "./schema";
import { seed } from "./seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL first");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  const cmd = process.argv[2];
  if (cmd === "migrate") await migrate(db, { migrationsFolder: "drizzle" });
  else if (cmd === "seed") await seed(db as unknown as DB);
  else throw new Error("Usage: scripts.ts migrate|seed");
  await pool.end();
  console.log(`${cmd}: done`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
