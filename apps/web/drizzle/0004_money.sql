CREATE TABLE "cash_handovers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"courier_id" text NOT NULL,
	"hub_id" text,
	"expected" integer NOT NULL,
	"counted" integer NOT NULL,
	"difference" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"received_by" text,
	"resolution" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_handovers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "courier_pay_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"courier_id" text NOT NULL,
	"deliveries" integer NOT NULL,
	"pickups" integer NOT NULL,
	"bonus" integer NOT NULL,
	"deductions" integer NOT NULL,
	"total" integer NOT NULL,
	"paid_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"total" integer NOT NULL,
	"count" integer NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payout_batches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"method" text NOT NULL,
	"account" text NOT NULL,
	"holder" text NOT NULL,
	"batch_id" text,
	"note" text DEFAULT '' NOT NULL,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payout_requests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "payout_method" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "payout_account" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "payout_holder" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "legal_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "nif" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "rc" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_courier_id_users_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_pay_runs" ADD CONSTRAINT "courier_pay_runs_courier_id_users_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_pay_runs" ADD CONSTRAINT "courier_pay_runs_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_handovers_courier_idx" ON "cash_handovers" USING btree ("courier_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "courier_pay_runs_month_courier" ON "courier_pay_runs" USING btree ("month","courier_id");--> statement-breakpoint
CREATE INDEX "payout_requests_merchant_idx" ON "payout_requests" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "payout_requests_status_idx" ON "payout_requests" USING btree ("status");