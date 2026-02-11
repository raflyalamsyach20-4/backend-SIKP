import { createDbClient } from './src/db';
import { submissionDocuments } from './src/db/schema';
import { isNull, notInArray, sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';

// Load .env
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const db = createDbClient(DATABASE_URL);

async function checkInvalidDocuments() {
  console.log('🔍 Checking for invalid documents...\n');
  
  // 1. Check for NULL document_type
  console.log('1️⃣ Documents with NULL document_type:');
  const nullDocs = await db
    .select({
      id: submissionDocuments.id,
      submissionId: submissionDocuments.submissionId,
      documentType: submissionDocuments.documentType,
      fileName: submissionDocuments.fileName,
      originalName: submissionDocuments.originalName,
      createdAt: submissionDocuments.createdAt,
    })
    .from(submissionDocuments)
    .where(isNull(submissionDocuments.documentType));
    
  console.log(`Found ${nullDocs.length} documents with NULL documentType:`);
  nullDocs.forEach(doc => {
    console.log(`  - ID: ${doc.id}`);
    console.log(`    Submission: ${doc.submissionId}`);
    console.log(`    File: ${doc.originalName}`);
    console.log(`    Created: ${doc.createdAt}`);
    console.log('');
  });
  
  // 2. Get all distinct document types
  console.log('\n2️⃣ All distinct document_type values:');
  const distinctTypes = await db
    .select({
      documentType: submissionDocuments.documentType,
      count: sql<number>`count(*)::int`,
    })
    .from(submissionDocuments)
    .groupBy(submissionDocuments.documentType);
    
  console.log('Document types in database:');
  distinctTypes.forEach(type => {
    const isValid = [
      'PROPOSAL_KETUA',
      'SURAT_KESEDIAAN',
      'FORM_PERMOHONAN',
      'KRS_SEMESTER_4',
      'DAFTAR_KUMPULAN_NILAI',
      'BUKTI_PEMBAYARAN_UKT',
    ].includes(type.documentType || '');
    
    const status = isValid ? '✅' : '❌';
    console.log(`  ${status} ${type.documentType || 'NULL'}: ${type.count} documents`);
  });
  
  // 3. Get all documents with their types
  console.log('\n3️⃣ All documents detail:');
  const allDocs = await db
    .select({
      id: submissionDocuments.id,
      submissionId: submissionDocuments.submissionId,
      documentType: submissionDocuments.documentType,
      originalName: submissionDocuments.originalName,
    })
    .from(submissionDocuments)
    .orderBy(submissionDocuments.createdAt);
    
  console.log(`Total documents: ${allDocs.length}`);
  allDocs.forEach((doc, index) => {
    console.log(`\n${index + 1}. ${doc.originalName}`);
    console.log(`   Type: ${doc.documentType || '❌ NULL'}`);
    console.log(`   Submission: ${doc.submissionId}`);
  });
  
  // 4. Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total documents: ${allDocs.length}`);
  console.log(`Documents with NULL type: ${nullDocs.length}`);
  console.log(`Valid documents: ${allDocs.length - nullDocs.length}`);
  
  if (nullDocs.length > 0) {
    console.log('\n⚠️  ACTION REQUIRED:');
    console.log('Some documents have NULL documentType and will be filtered out!');
    console.log('\nOptions:');
    console.log('1. Delete invalid documents:');
    console.log('   DELETE FROM submission_documents WHERE document_type IS NULL;');
    console.log('\n2. Update with correct type (check file names to guess):');
    console.log('   UPDATE submission_documents SET document_type = \'...\' WHERE id = \'...\';');
  } else {
    console.log('\n✅ All documents have valid documentType!');
  }
  
  process.exit(0);
}

checkInvalidDocuments().catch(console.error);
