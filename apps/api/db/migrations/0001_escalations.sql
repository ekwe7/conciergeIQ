CREATE SCHEMA "escalations";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "escalations"."alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_number" integer NOT NULL,
	"room_number" varchar(10) NOT NULL,
	"level" smallint NOT NULL,
	"channel" varchar(10) NOT NULL,
	"recipient_name" varchar(120) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"status" varchar(10) NOT NULL,
	"provider_message_id" varchar(64),
	"error" text,
	"waited_seconds" integer NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "alerts_order_level_unique" UNIQUE("order_id","level")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "escalations"."rules" (
	"hotel_id" uuid PRIMARY KEY NOT NULL,
	"manager" jsonb NOT NULL,
	"admin" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by_user_id" uuid
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_hotel_sent_at_idx" ON "escalations"."alerts" USING btree ("hotel_id","sent_at");