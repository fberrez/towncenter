CREATE TABLE "account_settings" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"google_places_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_settings" ADD CONSTRAINT "account_settings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- accounts that predate the setup screen have already onboarded themselves; a wizard forced on them would be a regression
UPDATE "users" SET "onboarded_at" = "created_at" WHERE "onboarded_at" IS NULL;