ALTER TABLE "hotels"."hotels" ADD COLUMN "brand_color" varchar(7) DEFAULT '#1B2A3A' NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels"."hotels" ADD COLUMN "accent_color" varchar(7) DEFAULT '#B8862F' NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels"."hotels" ADD COLUMN "welcome_headline" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels"."hotels" ADD COLUMN "languages" jsonb DEFAULT '["en"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels"."hotels" ADD COLUMN "logo_data" text;--> statement-breakpoint
ALTER TABLE "hotels"."hotels" ADD COLUMN "logo_content_type" varchar(40);--> statement-breakpoint
ALTER TABLE "hotels"."hotels" ADD COLUMN "logo_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "menu"."categories" ADD COLUMN "available_from" varchar(5);--> statement-breakpoint
ALTER TABLE "menu"."categories" ADD COLUMN "available_until" varchar(5);--> statement-breakpoint
ALTER TABLE "menu"."categories" ADD COLUMN "translations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "menu"."items" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "menu"."items" ADD COLUMN "pairs_with" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "menu"."items" ADD COLUMN "translations" jsonb DEFAULT '{}'::jsonb NOT NULL;