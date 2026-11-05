CREATE SCHEMA "concierge";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "concierge"."articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" varchar(120) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_hotel_idx" ON "concierge"."articles" USING btree ("hotel_id");