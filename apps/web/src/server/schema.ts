import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const hubs = pgTable("hubs", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  wilayaId: integer("wilaya_id").notNull(),
  address: text("address").notNull().default(""),
});

/** Algeria's 58 wilayas. `zone` drives pricing, `hubId` is the hub that serves the wilaya. */
export const wilayas = pgTable("wilayas", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  zone: integer("zone").notNull(),
  hubId: text("hub_id").notNull().references(() => hubs.id),
});

export const merchants = pgTable("merchants", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  wilayaId: integer("wilaya_id").notNull().references(() => wilayas.id),
  address: text("address").notNull().default(""),
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
    commune: text("commune").notNull(),
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
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    index("parcels_status_idx").on(t.status),
    index("parcels_merchant_idx").on(t.merchantId),
    index("parcels_courier_idx").on(t.courierId),
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
