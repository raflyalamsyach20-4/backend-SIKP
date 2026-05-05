// @ts-nocheck
import * as dotenv from 'dotenv';
import { getMaintenanceSql } from './maintenance-client';

dotenv.config({ path: '.env' });

const args = process.argv.slice(2);
const hasApplyArg = args.includes('--apply');
const idsArg = args.find((arg) => arg.startsWith('--ids='));

const APPLY = hasApplyArg || process.env.APPLY === 'true';
const submissionIdsRaw = idsArg ? idsArg.slice('--ids='.length) : (process.env.SUBMISSION_IDS || '');
const submissionIds = submissionIdsRaw
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id.length > 0);

const sanitizeId = (id: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid submission ID format: ${id}`);
  }
  return id;
};

const toInClause = (ids: string[]) => ids.map((id) => `'${sanitizeId(id)}'`).join(', ');

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = getMaintenanceSql();

  const idFilter = submissionIds.length > 0
    ? `AND s.id IN (${toInClause(submissionIds)})`
    : '';

  try {
    console.log('\n[Rollback Wakdek Approval] Start\n');
    console.log(`[Mode] ${APPLY ? 'APPLY (write changes)' : 'DRY RUN (no changes)'}`);
    if (submissionIds.length > 0) {
      console.log(`[Filter] submission_ids=${submissionIds.join(', ')}`);
    } else {
      console.log('[Filter] all submissions that are already approved by dosen/wakil dekan');
    }

    const candidates = await sql.query(`
      SELECT
        s.id,
        s.workflow_stage,
        s.status,
        s.admin_verification_status,
        s.dosen_verification_status,
        s.final_signed_file_url,
        s.dosen_verified_by_dosen_id,
        s.dosen_verified_at,
        COUNT(gl.id)::int AS generated_letter_count
      FROM submissions s
      LEFT JOIN generated_letters gl ON gl.submission_id = s.id
      WHERE s.workflow_stage = 'COMPLETED'
        AND s.admin_verification_status = 'APPROVED'
        AND s.dosen_verification_status = 'APPROVED'
        ${idFilter}
      GROUP BY s.id
      ORDER BY s.id ASC
    `);

    console.log(`\n[Preview] Candidate rows: ${candidates.length}`);
    if (candidates.length > 0) {
      for (const row of candidates) {
        console.log(
          `- ${row.id} | stage=${row.workflow_stage} | status=${row.status} | final_file=${row.final_signed_file_url ? 'yes' : 'no'} | generated_letters=${row.generated_letter_count}`
        );
      }
    }

    if (!APPLY) {
      console.log('\n[DRY RUN] No data changed.');
      console.log('[DRY RUN] Set APPLY=true to execute rollback.\n');
      process.exit(0);
    }

    await sql.query('BEGIN');

    const deletedLetters = await sql.query(`
      DELETE FROM generated_letters gl
      USING submissions s
      WHERE gl.submission_id = s.id
        AND s.workflow_stage = 'COMPLETED'
        AND s.admin_verification_status = 'APPROVED'
        AND s.dosen_verification_status = 'APPROVED'
        ${idFilter}
      RETURNING gl.id
    `);

    const rolledBack = await sql.query(`
      UPDATE submissions s
      SET
        status = 'PENDING_REVIEW'::submission_status,
        workflow_stage = 'PENDING_DOSEN_VERIFICATION'::workflow_stage,
        dosen_verification_status = 'PENDING'::submission_verification_status,
        dosen_verified_at = NULL,
        dosen_verified_by_dosen_id = NULL,
        dosen_rejection_reason = NULL,
        final_signed_file_url = NULL,
        status_history = COALESCE((
          SELECT jsonb_agg(entry)
          FROM jsonb_array_elements(COALESCE(s.status_history::jsonb, '[]'::jsonb)) entry
          WHERE NOT (
            COALESCE(entry->>'actor', '') = 'DOSEN'
            AND COALESCE(entry->>'workflowStage', '') IN ('COMPLETED', 'REJECTED_DOSEN')
          )
        ), '[]'::jsonb)::json,
        updated_at = NOW()
      WHERE s.workflow_stage = 'COMPLETED'
        AND s.admin_verification_status = 'APPROVED'
        AND s.dosen_verification_status = 'APPROVED'
        ${idFilter}
      RETURNING s.id
    `);

    await sql.query('COMMIT');

    console.log(`\n[Result] Rolled back submissions: ${rolledBack.length}`);
    console.log(`[Result] Deleted generated_letters rows: ${deletedLetters.length}`);
    console.log('\n[Rollback Wakdek Approval] Done.\n');
    process.exit(0);
  } catch (error) {
    try {
      await sql.query('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    console.error('[Rollback Wakdek Approval] Failed:', error);
    process.exit(1);
  }
};

run();
