// @ts-nocheck
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

type WorkflowVerificationRow = {
  total_rows: number;
  dosen_queue_eligible: number;
  pending_admin_wrong_status: number;
  pending_dosen_wrong_status: number;
  rejected_admin_wrong_status: number;
  completed_wrong_status: number;
  rejected_dosen_wrong_status: number;
  premature_final_outside_completed: number;
  invalid_completed_rows: number;
  completed_without_final_file: number;
};

const verifyWorkflow = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log('\n[Verify] Checking submission workflow consistency...\n');

    const rows = await sql(`
      SELECT
        COUNT(*)::int AS total_rows,
        COUNT(*) FILTER (
          WHERE workflow_stage = 'PENDING_DOSEN_VERIFICATION'
            AND admin_verification_status = 'APPROVED'
        )::int AS dosen_queue_eligible,
        COUNT(*) FILTER (
          WHERE workflow_stage = 'PENDING_ADMIN_REVIEW'
            AND status <> 'PENDING_REVIEW'
        )::int AS pending_admin_wrong_status,
        COUNT(*) FILTER (
          WHERE workflow_stage = 'PENDING_DOSEN_VERIFICATION'
            AND status <> 'PENDING_REVIEW'
        )::int AS pending_dosen_wrong_status,
        COUNT(*) FILTER (
          WHERE workflow_stage = 'REJECTED_ADMIN'
            AND status <> 'PENDING_REVIEW'
        )::int AS rejected_admin_wrong_status,
        COUNT(*) FILTER (
          WHERE workflow_stage = 'COMPLETED'
            AND status <> 'APPROVED'
        )::int AS completed_wrong_status,
        COUNT(*) FILTER (
          WHERE workflow_stage = 'REJECTED_DOSEN'
            AND status <> 'REJECTED'
        )::int AS rejected_dosen_wrong_status,
        COUNT(*) FILTER (
          WHERE final_signed_file_url IS NOT NULL
            AND workflow_stage <> 'COMPLETED'
        )::int AS premature_final_outside_completed,
        COUNT(*) FILTER (
          WHERE workflow_stage = 'COMPLETED'
            AND dosen_verification_status <> 'APPROVED'
        )::int AS invalid_completed_rows,
        COUNT(*) FILTER (
          WHERE workflow_stage = 'COMPLETED'
            AND final_signed_file_url IS NULL
        )::int AS completed_without_final_file
      FROM submissions
    `);

    const summary = rows[0] as WorkflowVerificationRow;

    console.log('[Verify] Summary:', summary);

    const violations = [
      {
        key: 'pending_admin_wrong_status',
        count: summary.pending_admin_wrong_status,
        message: 'PENDING_ADMIN_REVIEW rows must keep status=PENDING_REVIEW',
      },
      {
        key: 'pending_dosen_wrong_status',
        count: summary.pending_dosen_wrong_status,
        message: 'PENDING_DOSEN_VERIFICATION rows must keep status=PENDING_REVIEW',
      },
      {
        key: 'rejected_admin_wrong_status',
        count: summary.rejected_admin_wrong_status,
        message: 'REJECTED_ADMIN rows must keep status=PENDING_REVIEW',
      },
      {
        key: 'completed_wrong_status',
        count: summary.completed_wrong_status,
        message: 'COMPLETED rows must keep status=APPROVED',
      },
      {
        key: 'rejected_dosen_wrong_status',
        count: summary.rejected_dosen_wrong_status,
        message: 'REJECTED_DOSEN rows must keep status=REJECTED',
      },
      {
        key: 'premature_final_outside_completed',
        count: summary.premature_final_outside_completed,
        message: 'Final signed file exists but workflow stage is not COMPLETED',
      },
      {
        key: 'invalid_completed_rows',
        count: summary.invalid_completed_rows,
        message: 'COMPLETED rows without dosen_verification_status=APPROVED',
      },
      {
        key: 'completed_without_final_file',
        count: summary.completed_without_final_file,
        message: 'COMPLETED rows without final signed file',
      },
    ].filter((item) => item.count > 0);

    if (violations.length > 0) {
      console.error('\n[Verify] FAILED. Found workflow anomalies:');
      for (const violation of violations) {
        console.error(`- ${violation.message}: ${violation.count}`);
      }
      console.error('');
      process.exit(1);
    }

    console.log('\n[Verify] PASSED. No workflow anomalies detected.\n');
    process.exit(0);
  } catch (error) {
    console.error('[Verify] Failed:', error);
    process.exit(1);
  }
};

verifyWorkflow();