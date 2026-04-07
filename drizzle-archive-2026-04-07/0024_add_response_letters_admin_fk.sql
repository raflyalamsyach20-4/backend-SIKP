-- Add foreign key for verified_by_admin_id
ALTER TABLE "response_letters" 
ADD CONSTRAINT IF NOT EXISTS "response_letters_verified_by_admin_id_users_id_fk" 
FOREIGN KEY ("verified_by_admin_id") REFERENCES "users"("id") ON DELETE set null;
