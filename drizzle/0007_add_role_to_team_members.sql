-- Add role column to team_members table
ALTER TABLE "team_members" ADD COLUMN "role" text DEFAULT 'ANGGOTA' NOT NULL;
