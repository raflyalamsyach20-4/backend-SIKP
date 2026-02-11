import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

const sql = neon(process.env.DATABASE_URL);

async function checkDocuments() {
  try {
    // Get all documents
    const docs = await sql`
      SELECT 
        sd.id,
        sd.submission_id,
        sd.document_type,
        sd.original_name,
        sd.file_name,
        sd.file_url,
        sd.file_type,
        sd.created_at,
        u1.nama as member_name,
        u2.nama as uploader_name
      FROM submission_documents sd
      JOIN users u1 ON sd.member_user_id = u1.id
      JOIN users u2 ON sd.uploaded_by_user_id = u2.id
      ORDER BY sd.created_at DESC
    `;

    console.log('\n📋 All Documents in Database:');
    console.log('======================\n');
    
    if (docs.length === 0) {
      console.log('❌ No documents found');
      return;
    }

    for (const doc of docs) {
      console.log(`📄 ${doc.document_type}`);
      console.log(`   Original name: ${doc.original_name}`);
      console.log(`   Member: ${doc.member_name}`);
      console.log(`   Uploader: ${doc.uploader_name}`);
      console.log(`   File type: ${doc.file_type}`);
      console.log(`   Upload date: ${new Date(doc.created_at).toLocaleDateString('id-ID')}`);
      console.log(`   File name (key): ${doc.file_name}`);
      console.log(`   File URL: ${doc.file_url}`);
      
      // Check URL format
      if (doc.file_url.includes('pub-')) {
        console.log(`   ✅ URL has pub- domain (public)`);
      } else if (doc.file_url.includes('r2.cloudflarestorage.com')) {
        console.log(`   ⚠️  URL has r2.cloudflarestorage.com (private endpoint)`);
      }
      console.log();
    }

    console.log(`\n📊 Total documents: ${docs.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDocuments();
