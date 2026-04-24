CREATE TABLE "auth_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"auth_user_id" varchar(255) NOT NULL,
	"active_identity" varchar(100),
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_auth_sessions_auth_user_id" ON "auth_sessions" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_sessions_expires_at" ON "auth_sessions" USING btree ("expires_at");