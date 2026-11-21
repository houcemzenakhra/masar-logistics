CREATE TABLE "claim_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"image" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"parcel_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"amount_requested" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"amount_approved" integer,
	"decision_note" text DEFAULT '' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "courier_positions" (
	"courier_id" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy" double precision,
	"heading" double precision,
	"speed" double precision,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_trail" (
	"id" text PRIMARY KEY NOT NULL,
	"courier_id" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"parcel_id" text NOT NULL,
	"kind" text NOT NULL,
	"image" text,
	"received_by" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"push" text DEFAULT 'queued' NOT NULL,
	"push_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "recipient_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"parcel_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "delivery_code" text DEFAULT lpad(floor(random() * 10000)::int::text, 4, '0') NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "fail_reason" text;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "preferred_date" text;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "instructions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "rating_comment" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lang" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_photos" ADD CONSTRAINT "claim_photos_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_positions" ADD CONSTRAINT "courier_positions_courier_id_users_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_trail" ADD CONSTRAINT "courier_trail_courier_id_users_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipient_requests" ADD CONSTRAINT "recipient_requests_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_photos_claim_idx" ON "claim_photos" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claims_merchant_idx" ON "claims" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "claims_status_idx" ON "claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claims_parcel_idx" ON "claims" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "courier_trail_courier_at_idx" ON "courier_trail" USING btree ("courier_id","at");--> statement-breakpoint
CREATE INDEX "delivery_proofs_parcel_idx" ON "delivery_proofs" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_push_idx" ON "notifications" USING btree ("push");--> statement-breakpoint
CREATE INDEX "recipient_requests_parcel_idx" ON "recipient_requests" USING btree ("parcel_id");