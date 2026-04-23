/**
 * Migration Script: Set initial document status for existing records
 * 
 * This script initializes the status field for all existing documents
 * based on their submission status:
 * - If submission APPROVED → documents APPROVED
 * - If submission REJECTED → documents REJECTED
 * - Otherwise → documents PENDING
 * 
 * Run with: npx tsx src/db/migrate-document-status.ts
 */

import * as dotenv from 'dotenv';
import { submissionDocuments, submissions } from './schema';
import { eq } from 'drizzle-orm';
import { getMaintenanceDb } from './maintenance-client';

dotenv.config();

const db = getMaintenanceDb();

async function migrateDocumentStatus() {
  try {
    console.log('🚀 Starting document status migration...\n');

    // Get all documents with zero-length status history or PENDING status
    const docsToMigrate = await db
      .select({
        docId: submissionDocuments.id,
        submissionId: submissionDocuments.submissionId,
        submissionStatus: submissions.status,
      })
      .from(submissionDocuments)
      .innerJoin(submissions, eq(submissionDocuments.submissionId, submissions.id))
      .where(eq(submissionDocuments.status, 'PENDING'));

    console.log(`Found ${docsToMigrate.length} documents to process\n`);

    let approvedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;

    // Update each document based on submission status
    for (const doc of docsToMigrate) {
      let newStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';

      if (doc.submissionStatus === 'APPROVED') {
        newStatus = 'APPROVED';
        approvedCount++;
      } else if (doc.submissionStatus === 'REJECTED') {
        newStatus = 'REJECTED';
        rejectedCount++;
      } else {
        pendingCount++;
      }

      await db
        .update(submissionDocuments)
        .set({
          status: newStatus as any,
          statusUpdatedAt: new Date(),
        })
        .where(eq(submissionDocuments.id, doc.docId));

      console.log(
        `✅ Doc ${doc.docId.substring(0, 8)}... → ${newStatus}`
      );
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   APPROVED: ${approvedCount}`);
    console.log(`   REJECTED: ${rejectedCount}`);
    console.log(`   PENDING:  ${pendingCount}`);
    console.log(`   TOTAL:    ${docsToMigrate.length}\n`);

    console.log('✨ Document status migration completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateDocumentStatus();
