CREATE TABLE "user_active_identity_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"auth_user_id" varchar(255) NOT NULL,
	"active_identity" varchar(100),
	"effective_roles" json DEFAULT '[]' NOT NULL,
	"available_identities" json DEFAULT '[]' NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identity_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_user_id" varchar(255) NOT NULL,
	"identity_type" varchar(100) NOT NULL,
	"role_name" varchar(100) NOT NULL,
	"metadata" json DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_user_id" varchar(255);--> statement-breakpoint
UPDATE "users"
SET "auth_user_id" = COALESCE("auth_user_id", 'legacy:' || "id")
WHERE "auth_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "auth_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_provider" varchar(50) DEFAULT 'SSO_UNSRI' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id");--> statement-breakpoint
ALTER TABLE "user_active_identity_sessions" ADD CONSTRAINT "user_active_identity_sessions_auth_user_id_users_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."users"("auth_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_identity_cache" ADD CONSTRAINT "user_identity_cache_auth_user_id_users_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."users"("auth_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_active_identity_sessions_auth_user_id" ON "user_active_identity_sessions" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "idx_user_active_identity_sessions_expires_at" ON "user_active_identity_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_identity_cache_auth_user_id" ON "user_identity_cache" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_identity_cache" ON "user_identity_cache" USING btree ("auth_user_id","identity_type","role_name");--> statement-breakpoint