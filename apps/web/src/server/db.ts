import fs from "node:fs";
import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Q = DB | Tx;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * With DATABASE_URL set, connects to Postgres (run `npm run db:migrate` and `npm run db:seed` first).
 * Without it, runs an embedded Postgres (PGlite) stored in ./.data, migrated and seeded on first
 * use, so the project starts with zero setup.
 */
async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    // Small pool: each serverless instance needs few connections, and Neon's pooler does the rest.
    return drizzle(new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 }), { schema }) as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== "memory") fs.mkdirSync(dir, { recursive: true });
  const db = drizzle(new PGlite(dir === "memory" ? undefined : dir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  const { seed } = await import("./seed");
  await seed(db);
  return db;
}

const g = globalThis as unknown as { __masarDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  return (g.__masarDb ??= connect().catch((e) => {
    g.__masarDb = undefined;
    throw e;
  }));
}

/** Fresh in-memory database for tests. */
export async function memoryDb(): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export { schema };
