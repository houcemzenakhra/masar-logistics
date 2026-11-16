import { relations } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "hub", "courier", "merchant"] }).notNull(),
  hubId: text("hub_id").references(() => hubs.id),
  merchantId: text("merchant_id").references(() => merchants.id),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
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
  },
  (t) => [index("bags_manifest_idx").on(t.manifestId), index("bags_status_idx").on(t.status)],
);

export const parcels = pgTable(
  "parcels",
  {
    id: id(),
    tracking: text("tracking").notNull().unique(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    recipientName: text("recipient_name").notNull(),
    recipientPhone: text("recipient_phone").notNull(),
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
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    index("parcels_status_idx").on(t.status),
    index("parcels_merchant_idx").on(t.merchantId),
    index("parcels_courier_idx").on(t.courierId),
    index("parcels_bag_idx").on(t.bagId),
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
  kind: text("kind", { enum: ["delivery", "return_fee", "handover", "payout"] }).notNull(),
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

export const parcelsRelations = relations(parcels, ({ many }) => ({ events: many(parcelEvents) }));
export const parcelEventsRelations = relations(parcelEvents, ({ one }) => ({
  parcel: one(parcels, { fields: [parcelEvents.parcelId], references: [parcels.id] }),
}));
