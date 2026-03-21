import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const runBackfill = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log('\n[Backfill] Start normalizing legacy submission workflow data...\n');

    const before = await sql(`
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'APPROVED'
            AND admin_verification_status = 'PENDING'
            AND workflow_stage = 'DRAFT'
        )::int AS approved_legacy_rows,
        COUNT(*) FILTER (
          WHERE status = 'REJECTED'
            AND admin_verification_status = 'PENDING'
            AND workflow_stage = 'DRAFT'
        )::int AS rejected_legacy_rows,
        COUNT(*)::int AS total_rows
      FROM submissions
    `);

    console.log('[Backfill] Before:', before[0]);

    const approvedResult = await sql(`
      UPDATE submissions
      SET
        admin_verification_status = 'APPROVED'::submission_verification_status,
        admin_verified_at = COALESCE(admin_verified_at, approved_at, updated_at, submitted_at, NOW()),
        workflow_stage = CASE
          WHEN dosen_verification_status = 'APPROVED' OR final_signed_file_url IS NOT NULL
            THEN 'COMPLETED'::workflow_stage
          ELSE 'PENDING_DOSEN_VERIFICATION'::workflow_stage
        END,
        updated_at = NOW()
      WHERE status = 'APPROVED'
        AND admin_verification_status = 'PENDING'
        AND workflow_stage = 'DRAFT'
      RETURNING id
    `);

    const rejectedResult = await sql(`
      UPDATE submissions
      SET
        admin_verification_status = 'REJECTED'::submission_verification_status,
        admin_verified_at = COALESCE(admin_verified_at, updated_at, submitted_at, NOW()),
        admin_rejection_reason = COALESCE(admin_rejection_reason, rejection_reason),
        workflow_stage = 'REJECTED_ADMIN'::workflow_stage,
        updated_at = NOW()
      WHERE status = 'REJECTED'
        AND admin_verification_status = 'PENDING'
        AND workflow_stage = 'DRAFT'
      RETURNING id
    `);

    const after = await sql(`
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'APPROVED'
            AND admin_verification_status = 'PENDING'
            AND workflow_stage = 'DRAFT'
        )::int AS approved_legacy_rows,
        COUNT(*) FILTER (
          WHERE status = 'REJECTED'
            AND admin_verification_status = 'PENDING'
            AND workflow_stage = 'DRAFT'
        )::int AS rejected_legacy_rows,
        COUNT(*) FILTER (
          WHERE status = 'APPROVED'
            AND admin_verification_status = 'APPROVED'
            AND workflow_stage = 'PENDING_DOSEN_VERIFICATION'
        )::int AS dosen_queue_rows,
        COUNT(*) FILTER (
          WHERE workflow_stage = 'COMPLETED'
            AND dosen_verification_status = 'APPROVED'
            AND final_signed_file_url IS NOT NULL
        )::int AS completed_with_final_rows,
        COUNT(*)::int AS total_rows
      FROM submissions
    `);

    console.log('[Backfill] Updated approved rows:', approvedResult.length);
    console.log('[Backfill] Updated rejected rows:', rejectedResult.length);
    console.log('[Backfill] After:', after[0]);
    console.log('\n[Backfill] Done.\n');
    process.exit(0);
  } catch (error) {
    console.error('[Backfill] Failed:', error);
    process.exit(1);
  }
};

runBackfill();
