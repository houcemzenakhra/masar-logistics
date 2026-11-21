CREATE TABLE "stop_desks" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"hub_id" text NOT NULL,
	"wilaya_id" integer NOT NULL,
	"commune_id" integer,
	"address" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"hours" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stop_desks_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "confirm_orders" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "confirmation" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "delivery_type" text DEFAULT 'home' NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "stop_desk_id" text;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "allow_partial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "exchange" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "exchange_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "collected_amount" integer;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "kind" text DEFAULT 'delivery' NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "stop_desks" ADD CONSTRAINT "stop_desks_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_desks" ADD CONSTRAINT "stop_desks_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_desks" ADD CONSTRAINT "stop_desks_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stop_desks_wilaya_idx" ON "stop_desks" USING btree ("wilaya_id");--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_stop_desk_id_stop_desks_id_fk" FOREIGN KEY ("stop_desk_id") REFERENCES "public"."stop_desks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parcels_phone_idx" ON "parcels" USING btree ("recipient_phone");--> statement-breakpoint
CREATE INDEX "parcels_parent_idx" ON "parcels" USING btree ("parent_id");