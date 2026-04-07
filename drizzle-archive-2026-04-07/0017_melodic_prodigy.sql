ALTER TABLE "dosen" ADD COLUMN "esignature_url" text;--> statement-breakpoint
ALTER TABLE "dosen" ADD COLUMN "esignature_key" varchar(255);--> statement-breakpoint
ALTER TABLE "dosen" ADD COLUMN "esignature_uploaded_at" timestamp;