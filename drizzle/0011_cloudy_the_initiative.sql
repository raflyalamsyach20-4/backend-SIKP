CREATE TYPE "public"."assessment_criteria_type" AS ENUM('MENTOR', 'DOSEN_PA');--> statement-breakpoint
CREATE TABLE "assessment_criteria" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "assessment_criteria_type" NOT NULL,
	"category_id" text,
	"category_key" text,
	"label" text NOT NULL,
	"description" text,
	"weight" integer NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"sort_order" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_templates_type";--> statement-breakpoint
DROP INDEX "idx_templates_is_active";--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "type" SET DEFAULT 'standard';--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "is_locked" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "internships" ADD COLUMN "dosen_pa_id" text;--> statement-breakpoint
ALTER TABLE "lecturer_assessments" ADD COLUMN "is_locked" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_assessment_criteria_type" ON "assessment_criteria" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_assessment_criteria_active" ON "assessment_criteria" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_assessment_criteria_category" ON "assessment_criteria" USING btree ("type","category_id");--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "fields";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "is_active";