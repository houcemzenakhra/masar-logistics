# Masar

Masar (مسار, "path") is a logistics management platform for last-mile delivery in Algeria:
merchant pickup, a hub network covering all 58 wilayas, courier dispatch, live tracking and
cash-on-delivery settlement.

## What is in this repository

| Part | Where | Users | Status |
| --- | --- | --- | --- |
| Public website: landing, rate calculator, coverage, parcel tracking | `apps/web` (`/`, `/track`) | Anyone | Working |
| Merchant portal: orders, new order, label printing, COD wallet | `apps/web` (`/merchant`) | Sellers | Working |
| Admin console: overview, parcels, dispatch, hub scan, couriers, merchants, finance ledger, network, pricing | `apps/web` (`/admin`) | Operations, hub staff | Working |
| Courier run sheet (mobile web) | `apps/web` (`/courier`) | Couriers | Working |
| REST API for the mobile app | `apps/web` (`/api/v1`) | Mobile app | Working |
| Mobile app: courier, hub and merchant modes in one Flutter app | `apps/mobile` | Couriers, hub staff, merchants | Passes static analysis in CI, not yet run on a device |

The web app is one Next.js modular monolith. The domain logic lives in `apps/web/src/server`
and is shared by the pages and the API, so every surface follows the same rules.

## Run it

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000. With no configuration the app runs on an embedded Postgres
(PGlite) stored in `apps/web/.data`, migrated and filled with demo data on first start.

Demo accounts (password `masar-demo` for all):

| Role | Email | Lands on |
| --- | --- | --- |
| Admin | `admin@masar.dz` | `/admin` |
| Merchant | `merchant@masar.dz` | `/merchant` |
| Hub staff | `hub@masar.dz` | `/admin/scan` |
| Courier | `courier@masar.dz` | `/courier` |

These accounts are demo data. Remove them, or change their passwords, before real use.

### With a real Postgres

```bash
docker compose up -d
cd apps/web
export DATABASE_URL=postgres://masar:masar@localhost:5432/masar
export AUTH_SECRET=$(openssl rand -base64 32)
npm run db:migrate
npm run db:seed     # optional demo data
npm run dev
```

### Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## How it works

### Parcel lifecycle

One state machine (`src/server/domain/state.ts`) and one function that changes status
(`transition` in `src/server/services/parcels.ts`).

```
created → pickup_assigned → picked_up → at_origin_hub → in_transit → at_destination_hub
        → out_for_delivery → delivered
                           ↘ attempt_failed → out_for_delivery (retry)
                                            → return_initiated → returned
```

- Each move is checked against the state machine and the actor's role.
- Each move writes one row to the append-only `parcel_events` log.
- A parcel whose origin and destination hub are the same skips linehaul.
- Three failed attempts start a return automatically.
- Moves accept an idempotency key and the time they happened, so a phone that was offline
  can sync late and retry safely.

### Cash on delivery

A double-entry ledger (`src/server/services/ledger.ts`). Every transaction's lines sum to zero.

| Event | Debit | Credit |
| --- | --- | --- |
| Delivered | Courier (cash collected) | Merchant (COD minus fee), delivery revenue (fee) |
| Courier hands over cash | Company cash | Courier |
| Merchant payout | Merchant | Company cash |
| Returned | Merchant (return fee) | Returns revenue |

Balances are always computed from the lines, never stored.

### Pricing

Four tiers: same wilaya, north, highlands, south. The tier is set by the further zone of the
two ends. The first 5 kg are included. Rates are editable in Admin → Pricing.

### API

All under `/api/v1`, JSON, `Authorization: Bearer <token>` from `POST /auth/login`.

| Method | Path | Who |
| --- | --- | --- |
| POST | `/auth/login` | Anyone |
| GET | `/me` | Signed in |
| GET | `/track/:tracking` | Anyone |
| GET | `/wilayas` | Anyone |
| GET, POST | `/parcels` | Merchant, admin (couriers see their own) |
| GET | `/parcels/:id` | Owner, assigned courier, staff |
| POST | `/parcels/:id/transition` | By role, per the state machine |
| POST | `/scan` | Hub, admin |
| GET | `/courier/tasks` | Courier |
| GET | `/merchant/wallet` | Merchant |

## Not built yet

- Customer (recipient) app, SMS notifications, and Arabic/French translations.
- Bags and manifests for linehaul, route optimisation, auto-dispatch.
- Commune directory (commune is free text), map pins and live courier location.
- Merchant self-signup and KYC, staff management screens, claims and support tickets.
- WooCommerce and Shopify plugins, webhooks.
- The wilaya-to-hub assignment and the rates in the seed are starting values to review.
