DO $$ BEGIN
  CREATE TYPE assessment_criteria_type AS ENUM ('MENTOR', 'DOSEN_PA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "assessment_criteria" (
  "id" text PRIMARY KEY,
  "type" assessment_criteria_type NOT NULL,
  "category_id" text,
  "category_key" text,
  "label" text NOT NULL,
  "description" text,
  "weight" integer NOT NULL,
  "max_score" integer NOT NULL DEFAULT 100,
  "sort_order" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_assessment_criteria_type" ON "assessment_criteria" ("type");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_assessment_criteria_active" ON "assessment_criteria" ("is_active");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_assessment_criteria_category" ON "assessment_criteria" ("type", "category_id");
