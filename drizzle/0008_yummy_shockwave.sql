DROP INDEX "idx_templates_type";--> statement-breakpoint
DROP INDEX "idx_templates_is_active";--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "type" SET DEFAULT 'standard';--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "fields";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "is_active";