// @ts-nocheck
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

type SnapshotMember = {
  id?: number | string;
  name?: string;
  nim?: string;
  prodi?: string;
  role?: string;
};

type TeamMemberRow = {
  name: string | null;
  nim: string | null;
  prodi: string | null;
};

const hasValue = (value?: string | null) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== 'unknown' && normalized !== '-';
};

const normalizeText = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.trim();
  return normalized || null;
};

const runBackfill = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log('\n[Backfill] Start response letter supervisor/prodi repair...\n');

    const responseLetters = await sql(`
      SELECT
        rl.id,
        rl.submission_id,
        rl.supervisor_name,
        rl.members_snapshot,
        s.team_id,
        kp.nama AS dosen_kp_name
      FROM response_letters rl
      LEFT JOIN submissions s ON s.id = rl.submission_id
      LEFT JOIN teams t ON t.id = s.team_id
      LEFT JOIN users kp ON kp.id = t.dosen_kp_id
      ORDER BY rl.submitted_at DESC
    `);

    console.log(`[Backfill] Total response letters checked: ${responseLetters.length}`);

    let updatedSupervisorCount = 0;
    let updatedSnapshotCount = 0;
    let updatedRows = 0;

    for (const letter of responseLetters) {
      const currentSupervisor = normalizeText(letter.supervisor_name as string | null);
      const teamId = letter.team_id as string | null;
      const dosenKpName = normalizeText(letter.dosen_kp_name as string | null);

      let nextSupervisor = currentSupervisor;
      if (!hasValue(currentSupervisor) && hasValue(dosenKpName)) {
        nextSupervisor = dosenKpName;
      }

      const originalSnapshot = Array.isArray(letter.members_snapshot)
        ? (letter.members_snapshot as SnapshotMember[])
        : [];

      let nextSnapshot: SnapshotMember[] = originalSnapshot;
      let snapshotChanged = false;

      if (teamId && originalSnapshot.length > 0) {
        let teamMembers = (await sql(`
          SELECT
            u.nama AS name,
            m.nim AS nim,
            m.prodi AS prodi
          FROM team_members tm
          INNER JOIN users u ON u.id = tm.user_id
          LEFT JOIN mahasiswa m ON m.id = u.id
          WHERE tm.team_id = $1
            AND tm.invitation_status = 'ACCEPTED'
        `, [teamId])) as TeamMemberRow[];

        if (teamMembers.length === 0) {
          teamMembers = (await sql(`
            SELECT
              u.nama AS name,
              m.nim AS nim,
              m.prodi AS prodi
            FROM team_members tm
            INNER JOIN users u ON u.id = tm.user_id
            LEFT JOIN mahasiswa m ON m.id = u.id
            WHERE tm.team_id = $1
          `, [teamId])) as TeamMemberRow[];
        }

        nextSnapshot = originalSnapshot.map((snapshotMember) => {
          const needsProdi = !hasValue(snapshotMember.prodi);
          if (!needsProdi) return snapshotMember;

          const byNim = hasValue(snapshotMember.nim)
            ? teamMembers.find(
                (m) =>
                  normalizeText(m.nim)?.toLowerCase() ===
                  normalizeText(snapshotMember.nim)?.toLowerCase(),
              )
            : undefined;

          const byName = hasValue(snapshotMember.name)
            ? teamMembers.find(
                (m) =>
                  normalizeText(m.name)?.toLowerCase() ===
                  normalizeText(snapshotMember.name)?.toLowerCase(),
              )
            : undefined;

          const matched = byNim || byName;
          const matchedProdi = normalizeText(matched?.prodi);

          if (!hasValue(matchedProdi)) {
            return snapshotMember;
          }

          snapshotChanged = true;
          return {
            ...snapshotMember,
            prodi: matchedProdi || undefined,
          };
        });
      } else if (originalSnapshot.length > 0) {
        nextSnapshot = [...originalSnapshot];

        if (!hasValue(nextSupervisor)) {
          const leaderSnapshot =
            originalSnapshot.find(
              (member) => normalizeText(member.role)?.toLowerCase() === 'ketua',
            ) || originalSnapshot[0];

          if (hasValue(leaderSnapshot?.nim)) {
            const supervisorCandidates = (await sql(`
              SELECT DISTINCT kp.nama AS dosen_kp_name
              FROM team_members tm
              INNER JOIN users u ON u.id = tm.user_id
              LEFT JOIN mahasiswa m ON m.id = u.id
              INNER JOIN teams t ON t.id = tm.team_id
              LEFT JOIN users kp ON kp.id = t.dosen_kp_id
              WHERE m.nim = $1
                AND kp.nama IS NOT NULL
            `, [leaderSnapshot?.nim])) as Array<{ dosen_kp_name: string | null }>;

            const uniqueSupervisors = Array.from(
              new Set(
                supervisorCandidates
                  .map((candidate) => normalizeText(candidate.dosen_kp_name))
                  .filter((candidate): candidate is string => hasValue(candidate)),
              ),
            );

            if (uniqueSupervisors.length === 1) {
              nextSupervisor = uniqueSupervisors[0];
            }
          }
        }

        for (let index = 0; index < nextSnapshot.length; index += 1) {
          const snapshotMember = nextSnapshot[index];
          if (!snapshotMember || hasValue(snapshotMember.prodi) || !hasValue(snapshotMember.nim)) {
            continue;
          }

          const mahasiswaRows = (await sql(`
            SELECT prodi
            FROM mahasiswa
            WHERE nim = $1
            LIMIT 1
          `, [snapshotMember.nim])) as Array<{ prodi: string | null }>;

          const nimMatchedProdi = normalizeText(mahasiswaRows[0]?.prodi);
          if (!hasValue(nimMatchedProdi)) {
            continue;
          }

          snapshotChanged = true;
          nextSnapshot[index] = {
            ...snapshotMember,
            prodi: nimMatchedProdi || undefined,
          };
        }
      }

      const supervisorChanged = nextSupervisor !== currentSupervisor;

      if (!supervisorChanged && !snapshotChanged) {
        continue;
      }

      await sql(`
        UPDATE response_letters
        SET
          supervisor_name = $1,
          members_snapshot = $2,
          submitted_at = submitted_at
        WHERE id = $3
      `, [
        nextSupervisor,
        JSON.stringify(nextSnapshot),
        letter.id,
      ]);

      updatedRows += 1;
      if (supervisorChanged) {
        updatedSupervisorCount += 1;
      }
      if (snapshotChanged) {
        updatedSnapshotCount += 1;
      }
    }

    const unresolvedSupervisor = await sql(`
      SELECT COUNT(*)::int AS count
      FROM response_letters rl
      WHERE rl.supervisor_name IS NULL
         OR TRIM(rl.supervisor_name) = ''
         OR LOWER(TRIM(rl.supervisor_name)) IN ('unknown', '-')
    `);

    const unresolvedProdi = await sql(`
      SELECT COUNT(*)::int AS count
      FROM response_letters rl
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(rl.members_snapshot::jsonb, '[]'::jsonb)) AS member
        WHERE COALESCE(NULLIF(TRIM(member->>'prodi'), ''), 'unknown') ILIKE 'unknown'
           OR COALESCE(NULLIF(TRIM(member->>'prodi'), ''), '-') = '-'
      )
    `);

    console.log(`[Backfill] Updated rows: ${updatedRows}`);
    console.log(`[Backfill] Updated supervisor_name: ${updatedSupervisorCount}`);
    console.log(`[Backfill] Updated members_snapshot.prodi: ${updatedSnapshotCount}`);
    console.log(
      `[Backfill] Remaining unresolved supervisor_name: ${unresolvedSupervisor[0]?.count ?? 0}`,
    );
    console.log(
      `[Backfill] Remaining unresolved snapshot prodi: ${unresolvedProdi[0]?.count ?? 0}`,
    );
    console.log('\n[Backfill] Done.\n');
    process.exit(0);
  } catch (error) {
    console.error('[Backfill] Failed:', error);
    process.exit(1);
  }
};

runBackfill();
