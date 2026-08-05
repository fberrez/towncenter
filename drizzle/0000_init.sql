CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"owner_id" text NOT NULL,
	"target_id" text NOT NULL,
	"kind" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"value_cents" integer,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_grids" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"grid" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"siret" text NOT NULL,
	"siren" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"naf" text,
	"naf_label" text,
	"address" text,
	"postal_code" text,
	"city" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"establishment_count" integer,
	"company_created_at" text,
	"employee_range" text,
	"company_category" text,
	"revenue_cents" bigint,
	"net_income_cents" bigint,
	"finances_year" integer,
	"directors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"google_place_id" text,
	"google_fetched_at" timestamp with time zone,
	"rating_tenths" integer,
	"review_count" integer,
	"price_level" integer,
	"phone" text,
	"website_url" text,
	"business_status" text,
	"opening_hours" jsonb,
	"site_audit" jsonb,
	"audited_at" timestamp with time zone,
	"manual_website_url" text,
	"manual_phone" text,
	"manual_noted_at" timestamp with time zone,
	"state" text DEFAULT 'spotted' NOT NULL,
	"captured_at" timestamp with time zone,
	"notes" text,
	"harvested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "targets_rating_range" CHECK ("targets"."rating_tenths" is null or ("targets"."rating_tenths" >= 0 and "targets"."rating_tenths" <= 50)),
	CONSTRAINT "targets_review_count_positive" CHECK ("targets"."review_count" is null or "targets"."review_count" >= 0),
	CONSTRAINT "targets_price_level_range" CHECK ("targets"."price_level" is null or ("targets"."price_level" >= 1 and "targets"."price_level" <= 4)),
	CONSTRAINT "targets_lat_range" CHECK ("targets"."lat" >= -90 and "targets"."lat" <= 90),
	CONSTRAINT "targets_lng_range" CHECK ("targets"."lng" >= -180 and "targets"."lng" <= 180)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"label" text,
	"bbox" jsonb NOT NULL,
	"naf_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"targets_found" integer DEFAULT 0 NOT NULL,
	"targets_new" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_grids" ADD CONSTRAINT "price_grids_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_target_id_idx" ON "events" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "events_owner_occurred_at_idx" ON "events" USING btree ("owner_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_owner_kind_idx" ON "events" USING btree ("owner_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "targets_owner_siret_key" ON "targets" USING btree ("owner_id","siret");--> statement-breakpoint
CREATE INDEX "targets_owner_lat_lng_idx" ON "targets" USING btree ("owner_id","lat","lng");--> statement-breakpoint
CREATE INDEX "targets_owner_state_idx" ON "targets" USING btree ("owner_id","state");--> statement-breakpoint
CREATE INDEX "targets_owner_captured_at_idx" ON "targets" USING btree ("owner_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "zones_owner_started_at_idx" ON "zones" USING btree ("owner_id","started_at");--> statement-breakpoint
CREATE INDEX "zones_owner_status_idx" ON "zones" USING btree ("owner_id","status");