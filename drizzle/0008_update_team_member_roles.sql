-- Ensure existing records have correct role values
-- Set leaders to KETUA based on teams.leader_id
UPDATE "team_members" tm
SET "role" = 'KETUA'
FROM "teams" t
WHERE tm.team_id = t.id
  AND tm.user_id = t.leader_id;

-- Set non-leaders to ANGGOTA
UPDATE "team_members" tm
SET "role" = 'ANGGOTA'
FROM "teams" t
WHERE tm.team_id = t.id
  AND tm.user_id <> t.leader_id;
