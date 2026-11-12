CREATE TABLE "hubs" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"wilaya_id" integer NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	CONSTRAINT "hubs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ledger_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"txn_id" text NOT NULL,
	"account" text NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_txns" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"parcel_id" text,
	"memo" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"wilaya_id" integer NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcel_events" (
	"id" text PRIMARY KEY NOT NULL,
	"parcel_id" text NOT NULL,
	"status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor_id" text,
	"hub_id" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" text PRIMARY KEY NOT NULL,
	"tracking" text NOT NULL,
	"merchant_id" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"origin_wilaya_id" integer NOT NULL,
	"dest_wilaya_id" integer NOT NULL,
	"commune" text NOT NULL,
	"address" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"weight_kg" integer DEFAULT 1 NOT NULL,
	"cod_amount" integer DEFAULT 0 NOT NULL,
	"delivery_fee" integer NOT NULL,
	"return_fee" integer NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"origin_hub_id" text NOT NULL,
	"dest_hub_id" text NOT NULL,
	"current_hub_id" text,
	"courier_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "parcels_tracking_unique" UNIQUE("tracking")
);
--> statement-breakpoint
CREATE TABLE "rate_tiers" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"base" integer NOT NULL,
	"per_extra_kg" integer NOT NULL,
	"return_fee" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"hub_id" text,
	"merchant_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wilayas" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"zone" integer NOT NULL,
	"hub_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_txn_id_ledger_txns_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."ledger_txns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_txns" ADD CONSTRAINT "ledger_txns_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_txns" ADD CONSTRAINT "ledger_txns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_events" ADD CONSTRAINT "parcel_events_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_events" ADD CONSTRAINT "parcel_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_events" ADD CONSTRAINT "parcel_events_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_origin_wilaya_id_wilayas_id_fk" FOREIGN KEY ("origin_wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_dest_wilaya_id_wilayas_id_fk" FOREIGN KEY ("dest_wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_origin_hub_id_hubs_id_fk" FOREIGN KEY ("origin_hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_dest_hub_id_hubs_id_fk" FOREIGN KEY ("dest_hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_current_hub_id_hubs_id_fk" FOREIGN KEY ("current_hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_courier_id_users_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wilayas" ADD CONSTRAINT "wilayas_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_lines_account_idx" ON "ledger_lines" USING btree ("account");--> statement-breakpoint
CREATE INDEX "parcel_events_parcel_idx" ON "parcel_events" USING btree ("parcel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parcel_events_idem_idx" ON "parcel_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "parcels_status_idx" ON "parcels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "parcels_merchant_idx" ON "parcels" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "parcels_courier_idx" ON "parcels" USING btree ("courier_id");