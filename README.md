# Masar

Masar (مسار, "path") is a logistics management platform for last-mile delivery in Algeria:
merchant pickup, a hub network covering all 69 wilayas, bagged linehaul between hubs, courier
dispatch with route planning, live tracking and cash-on-delivery settlement. The interface is
available in English, French and Arabic (right to left).

## What is in this repository

| Part | Where | Users | Status |
| --- | --- | --- | --- |
| Public website: landing, rate calculator, coverage, parcel tracking, merchant sign-up | `apps/web` (`/`, `/track`, `/signup`) | Anyone | Working |
| Merchant portal: orders, new order, label printing, COD wallet | `apps/web` (`/merchant`) | Sellers | Working |
| Admin console: overview, parcels, dispatch with auto-assign, hub scan, linehaul (bags and manifests), couriers, merchant approval, finance ledger, network, pricing, team | `apps/web` (`/admin`) | Operations, hub staff | Working |
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

### Linehaul: bags and manifests

`src/server/services/linehaul.ts`. Parcels on a hub's floor that are bound for the same hub are
packed into a bag (`open → sealed → in_transit → received`). Sealed bags are loaded on a manifest,
one truck run (`open → departed → arrived`). When the truck leaves, every parcel in its bags becomes
"in transit"; scanning the bag in at the destination moves them all to "at destination hub". A bagged
parcel cannot be moved on its own. Hub staff can only pack and dispatch from their own hub and
receive at their own hub.

### Dispatch and route planning

- **Auto-assign** shares waiting parcels among the active couriers of each parcel's hub, always
  giving the next parcel to the courier with the fewest jobs.
- **Routes** (`src/server/domain/route.ts`): a courier's deliveries are ordered with
  nearest-neighbour followed by 2-opt, starting from their hub. Stops are commune centres, so the
  route orders communes, not streets, and distances are straight-line. It runs when parcels are
  assigned and on demand from the courier's run sheet.

### Communes

All 1,541 communes with French and Arabic names and centre coordinates are loaded from
`src/server/data/communes.json` (see `NOTICE.md` beside it for the source and licences). Order and
sign-up forms pick the commune from this directory.

### Merchant sign-up

`/signup` creates a merchant in `pending` state. Pending merchants can sign in but cannot create
orders until an admin approves them in Admin → Merchants.

### Languages

English text is the key; `src/i18n/fr.ts` and `src/i18n/ar.ts` hold the translations. The language
follows the browser on the first visit and the switcher afterwards. Arabic switches the layout to
right to left. Run with `MASAR_I18N_LOG=/path/file` to collect any string that has no translation.
Shipping labels stay in French, and server-generated messages that contain names or numbers
(for example "parcel X is in bag Y") are still shown in English.

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
| POST | `/auth/signup` | Anyone (merchant self-signup) |
| GET | `/wilayas`, `/wilayas/:id/communes` | Anyone |
| GET, POST | `/parcels` | Merchant, admin (couriers see their own) |
| GET | `/parcels/:id` | Owner, assigned courier, staff |
| POST | `/parcels/:id/transition` | By role, per the state machine |
| POST | `/scan` | Hub, admin (a `BAG…` code receives the whole bag) |
| GET, POST | `/bags`, `/bags/:id` | Hub, admin |
| GET, POST | `/manifests`, `/manifests/:id` | Hub, admin |
| GET | `/courier/tasks` | Courier |
| POST | `/courier/route` | Courier (re-plan the delivery order) |
| GET | `/merchant/wallet` | Merchant |

## Not built yet

- Customer (recipient) app and SMS notifications.
- Translations in the mobile app (it is English only).
- Bags and manifests screens in the mobile app (scanning a bag in works; packing is web only).
- Map pins, live courier location and street-level routing.
- KYC documents for merchants, claims and support tickets, password reset.
- WooCommerce and Shopify plugins, webhooks.
- The wilaya-to-hub assignment and the rates in the seed are starting values to review.
