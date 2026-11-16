CREATE TABLE "bags" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"origin_hub_id" text NOT NULL,
	"dest_hub_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"manifest_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sealed_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	CONSTRAINT "bags_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "communes" (
	"id" integer PRIMARY KEY NOT NULL,
	"wilaya_id" integer NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manifests" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"origin_hub_id" text NOT NULL,
	"dest_hub_id" text NOT NULL,
	"vehicle" text DEFAULT '' NOT NULL,
	"driver" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"departed_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	CONSTRAINT "manifests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "hubs" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "hubs" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "commune_id" integer;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "bag_id" text;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "route_seq" integer;--> statement-breakpoint
ALTER TABLE "bags" ADD CONSTRAINT "bags_origin_hub_id_hubs_id_fk" FOREIGN KEY ("origin_hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bags" ADD CONSTRAINT "bags_dest_hub_id_hubs_id_fk" FOREIGN KEY ("dest_hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bags" ADD CONSTRAINT "bags_manifest_id_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communes" ADD CONSTRAINT "communes_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_origin_hub_id_hubs_id_fk" FOREIGN KEY ("origin_hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_dest_hub_id_hubs_id_fk" FOREIGN KEY ("dest_hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bags_manifest_idx" ON "bags" USING btree ("manifest_id");--> statement-breakpoint
CREATE INDEX "bags_status_idx" ON "bags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communes_wilaya_idx" ON "communes" USING btree ("wilaya_id");--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_bag_id_bags_id_fk" FOREIGN KEY ("bag_id") REFERENCES "public"."bags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parcels_bag_idx" ON "parcels" USING btree ("bag_id");