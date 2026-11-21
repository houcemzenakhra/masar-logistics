CREATE TABLE "bag_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"bag_id" text NOT NULL,
	"parcel_id" text,
	"tracking" text NOT NULL,
	"result" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sort_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"commune_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dest_hub_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"desk" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bags" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "length_cm" integer;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "width_cm" integer;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "eta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "channel" text DEFAULT 'sms' NOT NULL;--> statement-breakpoint
ALTER TABLE "bag_checks" ADD CONSTRAINT "bag_checks_bag_id_bags_id_fk" FOREIGN KEY ("bag_id") REFERENCES "public"."bags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_checks" ADD CONSTRAINT "bag_checks_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_checks" ADD CONSTRAINT "bag_checks_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sort_zones" ADD CONSTRAINT "sort_zones_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bag_checks_bag_tracking_idx" ON "bag_checks" USING btree ("bag_id","tracking");--> statement-breakpoint
CREATE UNIQUE INDEX "sort_zones_hub_code_idx" ON "sort_zones" USING btree ("hub_id","code");