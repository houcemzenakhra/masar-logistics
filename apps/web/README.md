# Masar web

Next.js app holding the public website, merchant portal, admin console, courier run sheet and
the `/api/v1` REST API. See the [repository README](../../README.md) for setup.

```
src/server/domain     state machine and pricing (pure functions)
src/server/services   parcels, ledger, directory (all database access)
src/server/schema.ts  Drizzle schema; migrations are generated into ./drizzle
src/app               pages, server actions (actions.ts) and API routes
src/components        UI kit and shared parcel components
```

After changing `schema.ts`, run `npm run db:generate` to create a migration.
