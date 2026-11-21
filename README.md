# Masar

Masar (مسار, "path") is a logistics management platform for last-mile delivery in Algeria:
merchant pickup, a hub network covering all 69 wilayas, bagged linehaul between hubs, courier
dispatch with route planning, live tracking and cash-on-delivery settlement. The interface is
available in English, French and Arabic (right to left).

## What is in this repository

| Part | Where | Users | Status |
| --- | --- | --- | --- |
| Public website: landing, rate calculator, coverage, parcel tracking, merchant sign-up | `apps/web` (`/`, `/track`, `/signup`) | Anyone | Working |
| Merchant portal: orders, new order, spreadsheet import, label printing, COD wallet | `apps/web` (`/merchant`) | Sellers | Working |
| Admin console: overview, parcels, dispatch with auto-assign, hub scan, linehaul (bags and manifests), couriers, merchant approval, finance ledger, network, pricing, text messages, team, audit log | `apps/web` (`/admin`) | Operations, hub staff | Working |
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
export AUTH_SECRET=$(openssl rand -base64 48)
npm run db:migrate
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long password' npm run db:seed   # reference data + first admin
npm run dev
```

`npm run db:seed:demo` instead loads the demo accounts and parcels, with the password taken from
`MASAR_DEMO_PASSWORD`. Use it for staging only.

### Deploying (Vercel + Neon)

The staging site runs on Vercel with a Neon Postgres database. The project's root directory is
`apps/web` and its build command is `npm run build:staging`, which applies migrations and loads
the demo data (once) before building. For a real launch, use `npm run db:migrate && npm run db:seed`
with `ADMIN_EMAIL` and `ADMIN_PASSWORD` instead, and leave out the demo settings.

| Variable | Needed | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled Postgres connection string, used by the app |
| `DATABASE_URL_UNPOOLED` | recommended | Direct connection string, used for migrations |
| `AUTH_SECRET` | yes | At least 32 random characters. Changing it signs everyone out |
| `APP_URL` | recommended | Public address, used in SMS and reset links (defaults to the Vercel domain) |
| `MASAR_ENV=staging` | staging | Shows a "test data" banner and keeps search engines out |
| `MASAR_SHOW_DEMO=1`, `MASAR_DEMO_PASSWORD` | staging | Lists the demo accounts on the sign-in page; the password is not shown |
| `SMS_PROVIDER` and `SMS_HTTP_*` | to send SMS | See "Text messages" below |
| `RESEND_API_KEY`, `MAIL_FROM` | optional | Also send password reset links by email |
| `CRON_SECRET` | recommended | Lets the daily job (`/api/cron/outbox`, in `vercel.json`) send overdue messages and webhook retries and run the health alerts; also unlocks the detail of `/api/health` |
| `FCM_SERVICE_ACCOUNT` | optional | Firebase service account JSON, to push notifications to phones |
| `OSRM_URL` | optional | An OSRM routing server with the Algeria map. Without it, routes and expected times use straight-line estimates |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` | optional | WhatsApp Cloud API, with an approved template (default `masar_update`, body "Masar: {{1}}") in French and Arabic |

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

### Spreadsheet import

`src/server/services/imports.ts`. Merchants upload a `.xlsx` or `.csv` file of up to 1,000 orders.
Columns are recognised by their title in English, French or Arabic, in any order. Each row is
checked before anything is created:
- Phone numbers are read in any common form (`0550…`, `+213…`, a number that lost its zero).
- Wilayas are matched by code or name, communes by name in either language. A commune at most two
  letters off one name is corrected, and the correction is shown.
- The same phone and amount twice in the file, or ordered in the last 7 days, is flagged.

The merchant sees every row with its problems, then confirms. The valid rows are created in one
transaction, and all their labels print in one go. `POST /api/v1/parcels/bulk` does the same for
integrations, all or nothing, with a `dryRun` option.

### Text messages

`src/server/services/sms.ts`. Recipients get a text message when their parcel goes out for
delivery (with the amount to prepare and the courier's number) and when an attempt fails. A
"delivered" message can be switched on. Each parcel has a message language, French or Arabic.
French messages avoid accented letters outside the GSM alphabet so most fit in one SMS part;
Admin → Text messages previews each message with its part count.

Messages are written to an outbox table in the same transaction as the parcel event, then sent
after the response. Failed sends are kept and can be retried. With no provider configured,
messages are recorded as "test mode" and nothing is sent.

To send for real, use any gateway with an HTTP API:

```bash
SMS_PROVIDER=http
SMS_HTTP_URL=https://gateway.example/api/send
SMS_HTTP_HEADERS='{"Authorization":"Bearer <key>","Content-Type":"application/json"}'
SMS_HTTP_BODY='{"to":"{{to}}","message":"{{text}}","sender":"{{from}}"}'
SMS_HTTP_ID_PATH=data.id      # optional: where the gateway returns the message id
SMS_FROM=Masar
```

### Security

- **Sessions** are checked against the database on every request. Changing a password or
  deactivating an account signs it out on every device.
- **Rate limits** (`src/server/services/security.ts`), stored in Postgres so they hold across
  server instances: 8 failed sign-ins per account and 100 per network address in 15 minutes
  (Algerian mobile networks put many phones behind one address), 10 sign-ups per address per hour,
  and limits on password reset requests, imports and test messages.
- **Password reset**: "Forgot your password?" texts a one-hour link to the phone on the account,
  and emails it when Resend is configured. The answer is the same whether or not the email exists.
  Admins can also create a 24-hour link from Team or Merchants, to send by WhatsApp. Only a hash of
  each token is stored.
- **Audit log** (Admin → Audit log): sign-ins and failed sign-ins, sign-ups, approvals, accounts,
  password resets, cash handovers, payouts, rate changes, imports, SMS settings, and parcels marked
  lost or cancelled, with who, when and from which address. Parcel moves stay in each parcel's history.
- **Two-step sign-in** (authenticator app, RFC 6238) with ten one-time recovery codes, set up
  from Security in the account menu. Secrets are encrypted with a key derived from `AUTH_SECRET`;
  a code cannot be used twice. Operations can require it for all staff (Settings → Staff sign-in)
  and reset it for someone who lost their phone (Team).
- **Staff roles** for operations accounts: full access, finance, dispatch, support. Each page and
  action names its area (`src/lib/staff.ts`); the menu shows only what the role can open.
- **Merchant API keys** are stored as SHA-256 hashes; webhooks are signed (`Masar-Signature`,
  HMAC-SHA256 with a timestamp) and only go to public HTTPS addresses.
- **Health**: `/api/health` answers 200 or 503 for uptime monitors; the checks (ledger balance,
  failing messages and webhooks, parcels stuck out for delivery, payouts waiting) are on
  Settings → System health and alert operations once a day each.
- Standard security headers; the staging site is kept out of search engines.

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
| POST | `/parcels/bulk` | Merchant: up to 1,000 orders, all or nothing, optional `dryRun` |
| GET | `/parcels/:id` | Owner, assigned courier, staff |
| POST | `/parcels/:id/transition` | By role, per the state machine |
| POST | `/scan` | Hub, admin (a `BAG…` code receives the whole bag) |
| GET, POST | `/bags`, `/bags/:id` | Hub, admin |
| GET, POST | `/manifests`, `/manifests/:id` | Hub, admin |
| GET | `/courier/tasks` | Courier |
| POST | `/courier/route` | Courier (re-plan the delivery order) |
| GET | `/merchant/wallet` | Merchant |

## Not built yet

- A recipient app (recipients use the tracking page: confirm orders, choose a day, rate).
- App Store and Play Store releases: CI builds an Android APK and an unsigned iOS app; signing
  needs the store accounts.
- KYC documents for merchants.
- Shopify and YouCan apps (orders come in through their CSV exports today); WooCommerce has a plugin.
- The wilaya-to-hub assignment, the rates and the stop desks in the seed are starting values to review.
