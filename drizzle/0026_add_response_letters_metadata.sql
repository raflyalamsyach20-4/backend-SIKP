ALTER TABLE "response_letters" ADD COLUMN "file_type" varchar(100);
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN "original_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN "member_user_id" text;
--> statement-breakpoint
ALTER TABLE "response_letters"
ADD CONSTRAINT "response_letters_member_user_id_users_id_fk"
FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
