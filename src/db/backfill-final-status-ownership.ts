import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const backfillFinalStatusOwnership = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log('\n[Backfill] Normalizing legacy status ownership...\n');

    const pendingAdmin = await sql(`
      UPDATE submissions
      SET
        status = 'PENDING_REVIEW'::submission_status,
        approved_at = NULL,
        approved_by = NULL,
        updated_at = NOW()
      WHERE workflow_stage = 'PENDING_ADMIN_REVIEW'
        AND status <> 'PENDING_REVIEW'::submission_status
      RETURNING id
    `);

    const pendingDosen = await sql(`
      UPDATE submissions
      SET
        status = 'PENDING_REVIEW'::submission_status,
        approved_at = NULL,
        approved_by = NULL,
        rejection_reason = NULL,
        updated_at = NOW()
      WHERE workflow_stage = 'PENDING_DOSEN_VERIFICATION'
        AND (
          status <> 'PENDING_REVIEW'::submission_status
          OR approved_at IS NOT NULL
          OR approved_by IS NOT NULL
        )
      RETURNING id
    `);

    const rejectedAdmin = await sql(`
      UPDATE submissions
      SET
        status = 'PENDING_REVIEW'::submission_status,
        approved_at = NULL,
        approved_by = NULL,
        updated_at = NOW()
      WHERE workflow_stage = 'REJECTED_ADMIN'
        AND (
          status <> 'PENDING_REVIEW'::submission_status
          OR approved_at IS NOT NULL
          OR approved_by IS NOT NULL
        )
      RETURNING id
    `);

    const completed = await sql(`
      UPDATE submissions
      SET
        status = 'APPROVED'::submission_status,
        approved_at = COALESCE(dosen_verified_at, approved_at, updated_at, NOW()),
        approved_by = COALESCE(dosen_verified_by, approved_by),
        updated_at = NOW()
      WHERE workflow_stage = 'COMPLETED'
        AND status <> 'APPROVED'::submission_status
      RETURNING id
    `);

    const rejectedDosen = await sql(`
      UPDATE submissions
      SET
        status = 'REJECTED'::submission_status,
        approved_at = NULL,
        approved_by = COALESCE(dosen_verified_by, approved_by),
        rejection_reason = COALESCE(dosen_rejection_reason, rejection_reason),
        updated_at = NOW()
      WHERE workflow_stage = 'REJECTED_DOSEN'
        AND status <> 'REJECTED'::submission_status
      RETURNING id
    `);

    console.log('[Backfill] PENDING_ADMIN_REVIEW normalized:', pendingAdmin.length);
    console.log('[Backfill] PENDING_DOSEN_VERIFICATION normalized:', pendingDosen.length);
    console.log('[Backfill] REJECTED_ADMIN normalized:', rejectedAdmin.length);
    console.log('[Backfill] COMPLETED normalized:', completed.length);
    console.log('[Backfill] REJECTED_DOSEN normalized:', rejectedDosen.length);
    console.log('\n[Backfill] Done.\n');
  } catch (error) {
    console.error('[Backfill] Failed:', error);
    process.exit(1);
  }
};

backfillFinalStatusOwnership();