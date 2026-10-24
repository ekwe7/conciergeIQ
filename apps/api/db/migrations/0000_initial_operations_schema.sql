CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE SCHEMA "hotels";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE SCHEMA "menu";
--> statement-breakpoint
CREATE SCHEMA "ordering";
--> statement-breakpoint
CREATE SCHEMA "payments";
--> statement-breakpoint
CREATE SCHEMA "rooms";
--> statement-breakpoint
CREATE SCHEMA "stays";
--> statement-breakpoint
CREATE SEQUENCE "ordering"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."outbox_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_name" varchar(64) NOT NULL,
	"hotel_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit"."activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(32) NOT NULL,
	"hotel_id" uuid NOT NULL,
	"event_name" varchar(64) NOT NULL,
	"category" varchar(20) NOT NULL,
	"detail" varchar(255) NOT NULL,
	"actor_id" uuid,
	"actor_name" varchar(120) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "activity_log_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hotels"."hotels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"address" varchar(255) DEFAULT '' NOT NULL,
	"timezone" varchar(50) NOT NULL,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity"."refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"email" varchar(160) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_signed_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"price_minor" integer NOT NULL,
	"photo_url" varchar(255),
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ordering"."order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"item_name" varchar(120) NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"quantity" integer NOT NULL,
	"note" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ordering"."order_status_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" varchar(20),
	"to_status" varchar(20) NOT NULL,
	"changed_by_user_id" uuid,
	"changed_by_name" varchar(120) NOT NULL,
	"changed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ordering"."orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"room_id" uuid NOT NULL,
	"room_number" varchar(10) NOT NULL,
	"stay_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"total_minor" integer NOT NULL,
	"cancel_reason" varchar(255),
	"idempotency_key" varchar(64),
	"payment_method" varchar(20),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_hotel_idempotency_key_unique" UNIQUE("hotel_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_number" integer NOT NULL,
	"room_number" varchar(10) NOT NULL,
	"amount_minor" integer NOT NULL,
	"method" varchar(20) NOT NULL,
	"reference" varchar(64),
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_by_name" varchar(120) NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rooms"."rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"number" varchar(10) NOT NULL,
	"floor" integer NOT NULL,
	"qr_token" varchar(64) NOT NULL,
	"qr_regenerated_at" timestamp with time zone,
	"is_out_of_order" boolean DEFAULT false NOT NULL,
	"out_of_order_reason" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "rooms_hotel_number_unique" UNIQUE("hotel_id","number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stays"."stays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"room_number" varchar(10) NOT NULL,
	"guest_name" varchar(120) NOT NULL,
	"guest_phone" varchar(30),
	"checked_in_at" timestamp with time zone NOT NULL,
	"expected_check_out_at" timestamp with time zone NOT NULL,
	"checked_out_at" timestamp with time zone,
	"checked_in_by_user_id" uuid NOT NULL,
	"checked_out_by_user_id" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identity"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu"."items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "menu"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ordering"."order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "ordering"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ordering"."order_status_log" ADD CONSTRAINT "order_status_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "ordering"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_events_unpublished_idx" ON "platform"."outbox_events" USING btree ("id") WHERE published_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_hotel_occurred_at_idx" ON "audit"."activity_log" USING btree ("hotel_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_hotel_created_at_idx" ON "ordering"."orders" USING btree ("hotel_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_stay_idx" ON "ordering"."orders" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_hotel_recorded_at_idx" ON "payments"."payments" USING btree ("hotel_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stays_one_active_stay_per_room" ON "stays"."stays" USING btree ("room_id") WHERE checked_out_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stays_hotel_active_idx" ON "stays"."stays" USING btree ("hotel_id") WHERE checked_out_at is null;