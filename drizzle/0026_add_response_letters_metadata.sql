ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "file_type" varchar(100);
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "original_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "member_user_id" text;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
	 SELECT 1
	 FROM pg_constraint
	 WHERE conname = 'response_letters_member_user_id_users_id_fk'
 ) THEN
	ALTER TABLE "response_letters"
	ADD CONSTRAINT "response_letters_member_user_id_users_id_fk"
	FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
 END IF;
END $$;
