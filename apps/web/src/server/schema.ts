import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const hubs = pgTable("hubs", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  wilayaId: integer("wilaya_id").notNull(),
  address: text("address").notNull().default(""),
  /** Centre of the hub's commune: where courier routes start. */
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
});

/** Algeria's 69 wilayas. `zone` drives pricing, `hubId` is the hub that serves the wilaya. */
export const wilayas = pgTable("wilayas", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  zone: integer("zone").notNull(),
  hubId: text("hub_id").notNull().references(() => hubs.id),
});

/** The 1,541 communes, with their centre coordinates (see data/NOTICE.md). */
export const communes = pgTable(
  "communes",
  {
    id: integer("id").primaryKey(),
    wilayaId: integer("wilaya_id").notNull().references(() => wilayas.id),
    name: text("name").notNull(),
    nameAr: text("name_ar").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
  },
  (t) => [index("communes_wilaya_idx").on(t.wilayaId)],
);

export const merchants = pgTable("merchants", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  wilayaId: integer("wilaya_id").notNull().references(() => wilayas.id),
  address: text("address").notNull().default(""),
  /** Self-signups start as `pending` and cannot create orders until an admin approves them. */
  status: text("status", { enum: ["pending", "active", "suspended"] }).notNull().default("active"),
  /** Where payouts go: a CCP account (Algérie Poste) or a bank account (RIB). */
  payoutMethod: text("payout_method", { enum: ["ccp", "bank"] }),
  payoutAccount: text("payout_account").notNull().default(""),
  payoutHolder: text("payout_holder").notNull().default(""),
  /** Legal identifiers printed on invoices, when the merchant is a registered business. */
  legalName: text("legal_name").notNull().default(""),
  nif: text("nif").notNull().default(""),
  rc: text("rc").notNull().default(""),
  /** New orders wait for the recipient to confirm them (by text message) before a courier is sent. */
  confirmOrders: boolean("confirm_orders").notNull().default(false),
  /** Days a courier comes for pickups, as Algeria weekdays 0 (Sunday) to 6, e.g. "0,2,4". Empty: every day. */
  pickupDays: text("pickup_days").notNull().default(""),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "hub", "courier", "merchant"] }).notNull(),
  /** For operations staff: which parts of operations they work in. `owner` sees everything. */
  staffRole: text("staff_role", { enum: ["owner", "finance", "dispatch", "support"] }).notNull().default("owner"),
  /** Authenticator app secret, encrypted. Set while enrolling; active once `totpEnabledAt` is set. */
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  /** Last 30-second step accepted, so one code cannot be used twice. */
  totpLastStep: integer("totp_last_step"),
  /** SHA-256 of unused recovery codes. */
  recoveryCodes: jsonb("recovery_codes").$type<string[]>().notNull().default([]),
  hubId: text("hub_id").references(() => hubs.id),
  merchantId: text("merchant_id").references(() => merchants.id),
  active: boolean("active").notNull().default(true),
  /** Raised when the password changes or the account is deactivated; older sessions stop working. */
  sessionVersion: integer("session_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** Language of notifications sent to this person: set by the app they sign in with. */
  lang: text("lang", { enum: ["en", "fr", "ar"] }).notNull().default("fr"),
  createdAt: createdAt(),
});

/** One-time password reset links. Only a hash of the token is stored. */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** Null when the person asked for it themselves; otherwise the admin who made the link. */
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

/** Fixed-window counters for sign-in, sign-up and reset attempts. Works across server instances. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

/** Who did what. Parcel moves are already in parcel_events; this covers accounts, money and settings. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: text("actor_id").references(() => users.id),
    /** Kept as text so the entry still reads right if the account is renamed. */
    actorName: text("actor_name").notNull().default(""),
    action: text("action").notNull(),
    entity: text("entity").notNull().default(""),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_action_idx").on(t.action)],
);

/** Small key/value store for settings changed from the admin console. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateTiers = pgTable("rate_tiers", {
  key: text("key", { enum: ["local", "north", "highlands", "south"] }).primaryKey(),
  label: text("label").notNull(),
  base: integer("base").notNull(),
  perExtraKg: integer("per_extra_kg").notNull(),
  returnFee: integer("return_fee").notNull(),
});

/** A truck run between two hubs carrying sealed bags. */
export const manifests = pgTable("manifests", {
  id: id(),
  code: text("code").notNull().unique(),
  originHubId: text("origin_hub_id").notNull().references(() => hubs.id),
  destHubId: text("dest_hub_id").notNull().references(() => hubs.id),
  vehicle: text("vehicle").notNull().default(""),
  driver: text("driver").notNull().default(""),
  status: text("status", { enum: ["open", "departed", "arrived"] }).notNull().default("open"),
  createdAt: createdAt(),
  departedAt: timestamp("departed_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
});

/** A sack of parcels going from one hub to another. Scanned as one unit. */
export const bags = pgTable(
  "bags",
  {
    id: id(),
    code: text("code").notNull().unique(),
    originHubId: text("origin_hub_id").notNull().references(() => hubs.id),
    destHubId: text("dest_hub_id").notNull().references(() => hubs.id),
    status: text("status", { enum: ["open", "sealed", "in_transit", "received"] }).notNull().default("open"),
    manifestId: text("manifest_id").references(() => manifests.id),
    createdAt: createdAt(),
    sealedAt: timestamp("sealed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    /** When the receiving hub finished checking the bag's contents parcel by parcel. */
    checkedAt: timestamp("checked_at", { withTimezone: true }),
  },
  (t) => [index("bags_manifest_idx").on(t.manifestId), index("bags_status_idx").on(t.status)],
);

/** A spreadsheet of orders, checked row by row before anything is created. */
export const importBatches = pgTable(
  "import_batches",
  {
    id: id(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    createdBy: text("created_by").notNull().references(() => users.id),
    fileName: text("file_name").notNull(),
    status: text("status", { enum: ["draft", "committed", "discarded"] }).notNull().default("draft"),
    /** Every row as read and checked: the values to create, or the problems found. */
    rows: jsonb("rows").$type<unknown[]>().notNull(),
    validCount: integer("valid_count").notNull(),
    invalidCount: integer("invalid_count").notNull(),
    createdCount: integer("created_count").notNull().default(0),
    createdAt: createdAt(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (t) => [index("import_batches_merchant_idx").on(t.merchantId)],
);

/** A counter where recipients collect parcels themselves, run by a hub. */
export const stopDesks = pgTable(
  "stop_desks",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    hubId: text("hub_id").notNull().references(() => hubs.id),
    wilayaId: integer("wilaya_id").notNull().references(() => wilayas.id),
    communeId: integer("commune_id").references(() => communes.id),
    address: text("address").notNull(),
    phone: text("phone").notNull().default(""),
    /** Opening hours as shown to recipients, e.g. "Sat-Thu 9:00-18:00". */
    hours: text("hours").notNull().default(""),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("stop_desks_wilaya_idx").on(t.wilayaId)],
);

export const parcels = pgTable(
  "parcels",
  {
    id: id(),
    tracking: text("tracking").notNull().unique(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    recipientName: text("recipient_name").notNull(),
    recipientPhone: text("recipient_phone").notNull(),
    /** Language of the text messages sent to the recipient. */
    recipientLang: text("recipient_lang", { enum: ["fr", "ar"] }).notNull().default("fr"),
    originWilayaId: integer("origin_wilaya_id").notNull().references(() => wilayas.id),
    destWilayaId: integer("dest_wilaya_id").notNull().references(() => wilayas.id),
    /** Commune name as printed on the label. `communeId` links it to the directory when known. */
    commune: text("commune").notNull(),
    communeId: integer("commune_id").references(() => communes.id),
    address: text("address").notNull(),
    description: text("description").notNull().default(""),
    weightKg: integer("weight_kg").notNull().default(1),
    /** All money is whole Algerian dinars (DZD). */
    codAmount: integer("cod_amount").notNull().default(0),
    deliveryFee: integer("delivery_fee").notNull(),
    returnFee: integer("return_fee").notNull(),
    status: text("status").notNull().default("created"),
    originHubId: text("origin_hub_id").notNull().references(() => hubs.id),
    destHubId: text("dest_hub_id").notNull().references(() => hubs.id),
    currentHubId: text("current_hub_id").references(() => hubs.id),
    courierId: text("courier_id").references(() => users.id),
    /** The bag the parcel travels in between hubs, if any. */
    bagId: text("bag_id").references(() => bags.id),
    /** Position on the courier's optimised delivery route. */
    routeSeq: integer("route_seq"),
    /** The spreadsheet import that created the parcel, if any. */
    importId: text("import_id").references(() => importBatches.id),
    attempts: integer("attempts").notNull().default(0),
    /** Four digits sent to the recipient; the courier can ask for it as proof of delivery. */
    deliveryCode: text("delivery_code").notNull().default(sql`lpad(floor(random() * 10000)::int::text, 4, '0')`),
    /** Reason given on the last failed attempt. */
    failReason: text("fail_reason"),
    /** Day the recipient asked to be delivered, YYYY-MM-DD. Dispatch waits until then. */
    preferredDate: text("preferred_date"),
    /** Directions from the recipient for the courier. */
    instructions: text("instructions").notNull().default(""),
    /** Recipient's rating of the delivery, 1 to 5. */
    rating: integer("rating"),
    ratingComment: text("rating_comment").notNull().default(""),
    /** `pending` while the recipient has not confirmed the order; no pickup until then. */
    confirmation: text("confirmation", { enum: ["none", "pending", "confirmed", "declined"] }).notNull().default("none"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** `desk`: the recipient collects it at `stopDeskId` instead of a courier coming to the door. */
    deliveryType: text("delivery_type", { enum: ["home", "desk"] }).notNull().default("home"),
    stopDeskId: text("stop_desk_id").references(() => stopDesks.id),
    /** The recipient may keep part of the order and pay less; the rest comes back. */
    allowPartial: boolean("allow_partial").notNull().default(false),
    /** Exchange: the courier collects an item from the recipient on delivery. `exchangeNote` says which. */
    exchange: boolean("exchange").notNull().default(false),
    exchangeNote: text("exchange_note").notNull().default(""),
    /** Cash actually taken on delivery, when it differs from `codAmount` (partial delivery). */
    collectedAmount: integer("collected_amount"),
    /** `return_leg`: goods coming back to the merchant after a partial delivery or an exchange. */
    kind: text("kind", { enum: ["delivery", "return_leg"] }).notNull().default("delivery"),
    /** For a return leg: the delivery it comes from. */
    parentId: text("parent_id"),
    /** The merchant's own order number (shop, spreadsheet or API). Unique per merchant. */
    externalRef: text("external_ref"),
    /** Outer size in cm, when given. Large light parcels are charged by volume. */
    lengthCm: integer("length_cm"),
    widthCm: integer("width_cm"),
    heightCm: integer("height_cm"),
    /** Expected arrival at the door, from the courier's planned route. */
    eta: timestamp("eta", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    index("parcels_status_idx").on(t.status),
    index("parcels_merchant_idx").on(t.merchantId),
    index("parcels_courier_idx").on(t.courierId),
    index("parcels_bag_idx").on(t.bagId),
    index("parcels_phone_idx").on(t.recipientPhone),
    index("parcels_parent_idx").on(t.parentId),
    uniqueIndex("parcels_external_ref_idx").on(t.merchantId, t.externalRef),
  ],
);

/** Append-only scan and status log. One row per transition. */
export const parcelEvents = pgTable(
  "parcel_events",
  {
    id: id(),
    parcelId: text("parcel_id").notNull().references(() => parcels.id),
    status: text("status").notNull(),
    note: text("note").notNull().default(""),
    actorId: text("actor_id").references(() => users.id),
    hubId: text("hub_id").references(() => hubs.id),
    idempotencyKey: text("idempotency_key"),
    createdAt: createdAt(),
  },
  (t) => [
    index("parcel_events_parcel_idx").on(t.parcelId),
    uniqueIndex("parcel_events_idem_idx").on(t.idempotencyKey),
  ],
);

/** Double-entry ledger. Every transaction's lines sum to zero. */
export const ledgerTxns = pgTable("ledger_txns", {
  id: id(),
  kind: text("kind", { enum: ["delivery", "return_fee", "handover", "payout", "claim", "courier_pay", "cash_adjustment"] }).notNull(),
  parcelId: text("parcel_id").references(() => parcels.id),
  memo: text("memo").notNull().default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const ledgerLines = pgTable(
  "ledger_lines",
  {
    id: id(),
    txnId: text("txn_id").notNull().references(() => ledgerTxns.id),
    /** `courier:<id>`, `merchant:<id>`, `company:cash`, `revenue:delivery`, `revenue:returns` */
    account: text("account").notNull(),
    /** Positive = debit, negative = credit. */
    amount: integer("amount").notNull(),
  },
  (t) => [index("ledger_lines_account_idx").on(t.account)],
);

/**
 * Outbox of text messages. A message is written in the same transaction as the event that causes it,
 * then sent after the response. Failed sends stay here to be retried.
 */
export const smsMessages = pgTable(
  "sms_messages",
  {
    id: id(),
    /** International format, e.g. +213550123456. */
    to: text("to").notNull(),
    body: text("body").notNull(),
    kind: text("kind").notNull(),
    /** `whatsapp` messages fall back to a text message when WhatsApp cannot deliver them. */
    channel: text("channel", { enum: ["sms", "whatsapp"] }).notNull().default("sms"),
    parcelId: text("parcel_id").references(() => parcels.id),
    userId: text("user_id").references(() => users.id),
    /** Stops the same message being queued twice for one event, e.g. one per delivery attempt. */
    dedupeKey: text("dedupe_key").unique(),
    /** `simulated`: no provider is configured, so the message was recorded but not sent. */
    status: text("status", { enum: ["queued", "sending", "sent", "failed", "simulated"] }).notNull().default("queued"),
    provider: text("provider").notNull().default(""),
    providerId: text("provider_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("sms_status_idx").on(t.status), index("sms_parcel_idx").on(t.parcelId)],
);

/** A merchant asking to be paid what is owed to them. Paid in batches by finance. */
export const payoutRequests = pgTable(
  "payout_requests",
  {
    id: id(),
    code: text("code").notNull().unique(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    amount: integer("amount").notNull(),
    status: text("status", { enum: ["requested", "in_batch", "paid", "rejected", "cancelled"] }).notNull().default("requested"),
    /** Copied from the merchant when requested, so a later change does not redirect money in flight. */
    method: text("method", { enum: ["ccp", "bank"] }).notNull(),
    account: text("account").notNull(),
    holder: text("holder").notNull(),
    batchId: text("batch_id"),
    note: text("note").notNull().default(""),
    requestedBy: text("requested_by").references(() => users.id),
    createdAt: createdAt(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("payout_requests_merchant_idx").on(t.merchantId), index("payout_requests_status_idx").on(t.status)],
);

/** A transfer list sent to the bank or the post office, then marked paid with its reference. */
export const payoutBatches = pgTable("payout_batches", {
  id: id(),
  code: text("code").notNull().unique(),
  status: text("status", { enum: ["open", "paid"] }).notNull().default("open"),
  total: integer("total").notNull(),
  count: integer("count").notNull(),
  reference: text("reference").notNull().default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

/** Cash a courier hands in at the hub, counted against what the system says they hold. */
export const cashHandovers = pgTable(
  "cash_handovers",
  {
    id: id(),
    code: text("code").notNull().unique(),
    courierId: text("courier_id").notNull().references(() => users.id),
    hubId: text("hub_id").references(() => hubs.id),
    expected: integer("expected").notNull(),
    counted: integer("counted").notNull(),
    /** expected − counted. Positive: money missing. Negative: more cash than expected. */
    difference: integer("difference").notNull(),
    note: text("note").notNull().default(""),
    receivedBy: text("received_by").references(() => users.id),
    /** A shortfall stays on the courier's account until it is repaid or written off. */
    resolution: text("resolution", { enum: ["none", "repaid", "written_off", "deducted", "settled_by_pay"] }).notNull().default("none"),
    createdAt: createdAt(),
  },
  (t) => [index("cash_handovers_courier_idx").on(t.courierId, t.createdAt)],
);

/** Courier pay recorded for a month, once per courier. */
export const courierPayRuns = pgTable(
  "courier_pay_runs",
  {
    id: id(),
    month: text("month").notNull(),
    courierId: text("courier_id").notNull().references(() => users.id),
    deliveries: integer("deliveries").notNull(),
    pickups: integer("pickups").notNull(),
    bonus: integer("bonus").notNull(),
    deductions: integer("deductions").notNull(),
    total: integer("total").notNull(),
    paidBy: text("paid_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("courier_pay_runs_month_courier").on(t.month, t.courierId)],
);

/** What the courier recorded at the door: the recipient's code, a photo or a signature. */
export const deliveryProofs = pgTable(
  "delivery_proofs",
  {
    id: id(),
    parcelId: text("parcel_id").notNull().references(() => parcels.id),
    kind: text("kind", { enum: ["code", "photo", "signature"] }).notNull(),
    /** JPEG or PNG as a data URL, at most a few hundred kilobytes. Empty for a code. */
    image: text("image"),
    receivedBy: text("received_by").notNull().default(""),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    actorId: text("actor_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("delivery_proofs_parcel_idx").on(t.parcelId)],
);

/** Last known position of each courier on duty. */
export const courierPositions = pgTable("courier_positions", {
  courierId: text("courier_id").primaryKey().references(() => users.id),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracy: doublePrecision("accuracy"),
  heading: doublePrecision("heading"),
  speed: doublePrecision("speed"),
  at: timestamp("at", { withTimezone: true }).notNull(),
});

/** Recent positions, kept a few days to draw where a courier went. */
export const courierTrail = pgTable(
  "courier_trail",
  {
    id: id(),
    courierId: text("courier_id").notNull().references(() => users.id),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [index("courier_trail_courier_at_idx").on(t.courierId, t.at)],
);

/** Phones that receive push notifications. One person can have several. */
export const devices = pgTable(
  "devices",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    token: text("token").notNull().unique(),
    platform: text("platform", { enum: ["android", "ios", "web"] }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("devices_user_idx").on(t.userId)],
);

/**
 * Each person's notification inbox, and the outbox for push: a row is written in the same
 * transaction as the event, then pushed to the person's phones after the response.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Where the app opens when tapped, e.g. {"parcelId": "…"}. */
    data: jsonb("data").notNull().default({}),
    /** Stops one event notifying the same person twice. */
    dedupeKey: text("dedupe_key").unique(),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** `none`: the person has no phone registered. `simulated`: push is not configured. */
    push: text("push", { enum: ["queued", "sending", "sent", "failed", "simulated", "none"] }).notNull().default("queued"),
    pushError: text("push_error"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), index("notifications_push_idx").on(t.push)],
);

/** A merchant's claim for a lost or damaged parcel. Approved claims are paid into the wallet. */
export const claims = pgTable(
  "claims",
  {
    id: id(),
    code: text("code").notNull().unique(),
    parcelId: text("parcel_id").notNull().references(() => parcels.id),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    kind: text("kind", { enum: ["lost", "damaged", "missing_items"] }).notNull(),
    description: text("description").notNull(),
    amountRequested: integer("amount_requested").notNull(),
    status: text("status", { enum: ["open", "approved", "rejected"] }).notNull().default("open"),
    amountApproved: integer("amount_approved"),
    decisionNote: text("decision_note").notNull().default(""),
    decidedBy: text("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("claims_merchant_idx").on(t.merchantId), index("claims_status_idx").on(t.status), index("claims_parcel_idx").on(t.parcelId)],
);

export const claimPhotos = pgTable(
  "claim_photos",
  {
    id: id(),
    claimId: text("claim_id").notNull().references(() => claims.id),
    image: text("image").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("claim_photos_claim_idx").on(t.claimId)],
);

/** What a recipient asked for on the tracking page. Kept as a log; the parcel holds the current values. */
export const recipientRequests = pgTable(
  "recipient_requests",
  {
    id: id(),
    parcelId: text("parcel_id").notNull().references(() => parcels.id),
    kind: text("kind", { enum: ["reschedule", "instructions", "rating", "confirm", "decline"] }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("recipient_requests_parcel_idx").on(t.parcelId)],
);

export const parcelsRelations = relations(parcels, ({ many }) => ({ events: many(parcelEvents) }));
export const parcelEventsRelations = relations(parcelEvents, ({ one }) => ({
  parcel: one(parcels, { fields: [parcelEvents.parcelId], references: [parcels.id] }),
}));

// ---------- integrations: API keys, webhooks, pickups ----------

/** Keys a merchant's shop or software uses to call the API. Only a hash is stored. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    name: text("name").notNull(),
    /** First characters of the key, shown so people can tell keys apart. */
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    createdBy: text("created_by").notNull().references(() => users.id),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_keys_merchant_idx").on(t.merchantId)],
);

/** Where a merchant wants parcel events sent. Each request is signed with `secret`. */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    active: boolean("active").notNull().default(true),
    /** Failures in a row; reset by a success. */
    failures: integer("failures").notNull().default(0),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_endpoints_merchant_idx").on(t.merchantId)],
);

/** One event for one endpoint, retried with growing delays until it is accepted or gives up. */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    endpointId: text("endpoint_id").notNull().references(() => webhookEndpoints.id),
    event: text("event").notNull(),
    parcelId: text("parcel_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    responseStatus: integer("response_status"),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt), index("webhook_deliveries_endpoint_idx").on(t.endpointId)],
);

/** A pickup the merchant booked for a given day, on top of (or instead of) their regular days. */
export const pickupRequests = pgTable(
  "pickup_requests",
  {
    id: id(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    /** YYYY-MM-DD, Algeria time. */
    day: text("day").notNull(),
    window: text("window", { enum: ["morning", "afternoon"] }).notNull().default("morning"),
    note: text("note").notNull().default(""),
    /** Parcels the merchant expects to hand over, to size the run. */
    expected: integer("expected").notNull().default(0),
    status: text("status", { enum: ["booked", "cancelled"] }).notNull().default("booked"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("pickup_requests_day_idx").on(t.day), uniqueIndex("pickup_requests_merchant_day_idx").on(t.merchantId, t.day)],
);

// ---------- operations: sorting, bag checks ----------

/** A lane on a hub's floor. Parcels go to the lane of their destination hub or local commune. */
export const sortZones = pgTable(
  "sort_zones",
  {
    id: id(),
    hubId: text("hub_id").notNull().references(() => hubs.id),
    /** Painted on the floor, e.g. "A1". */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Local deliveries to these communes. */
    communeIds: jsonb("commune_ids").$type<number[]>().notNull().default([]),
    /** Parcels leaving for these hubs. */
    destHubIds: jsonb("dest_hub_ids").$type<string[]>().notNull().default([]),
    /** Stop desk parcels of this hub. */
    desk: boolean("desk").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sort_zones_hub_code_idx").on(t.hubId, t.code)],
);

/** Each parcel scanned while checking a received bag, including ones that should not be there. */
export const bagChecks = pgTable(
  "bag_checks",
  {
    id: id(),
    bagId: text("bag_id").notNull().references(() => bags.id),
    parcelId: text("parcel_id").references(() => parcels.id),
    tracking: text("tracking").notNull(),
    /** `extra`: the parcel was found in this bag but belongs elsewhere (or is unknown). */
    result: text("result", { enum: ["ok", "extra"] }).notNull(),
    actorId: text("actor_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("bag_checks_bag_tracking_idx").on(t.bagId, t.tracking)],
);
