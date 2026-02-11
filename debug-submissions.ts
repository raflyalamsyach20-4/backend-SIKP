import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

const sql = neon(process.env.DATABASE_URL);

async function checkSubmissions() {
  try {
    // Get all submissions with team info
    const submissions = await sql`
      SELECT 
        s.id,
        s.team_id,
        s.status,
        s.letter_purpose,
        s.company_name,
        s.created_at,
        s.submitted_at,
        t.code as team_code,
        u.nama as leader_name
      FROM submissions s
      JOIN teams t ON s.team_id = t.id
      JOIN users u ON t.leader_id = u.id
      ORDER BY s.created_at DESC
    `;

    console.log('\n📋 All Submissions:');
    console.log('======================\n');
    
    if (submissions.length === 0) {
      console.log('❌ No submissions found');
      return;
    }

    for (const sub of submissions) {
      const statusEmoji = sub.status === 'DRAFT' ? '📝' : sub.status === 'PENDING_REVIEW' ? '⏳' : sub.status === 'APPROVED' ? '✅' : '❌';
      
      console.log(`${statusEmoji} Submission ID: ${sub.id}`);
      console.log(`   Team: ${sub.team_code}`);
      console.log(`   Leader: ${sub.leader_name}`);
      console.log(`   Status: ${sub.status}`);
      console.log(`   Purpose: ${sub.letter_purpose}`);
      console.log(`   Company: ${sub.company_name}`);
      console.log(`   Created: ${new Date(sub.created_at).toLocaleDateString('id-ID')}`);
      if (sub.submitted_at) {
        console.log(`   Submitted: ${new Date(sub.submitted_at).toLocaleDateString('id-ID')}`);
      }
      console.log();
    }

    // Check documents for latest submission
    if (submissions.length > 0) {
      const latestSubId = submissions[0].id;
      const docs = await sql`
        SELECT 
          sd.id,
          sd.document_type,
          u1.nama as member_name,
          u2.nama as uploader_name,
          sd.created_at
        FROM submission_documents sd
        JOIN users u1 ON sd.member_user_id = u1.id
        JOIN users u2 ON sd.uploaded_by_user_id = u2.id
        WHERE sd.submission_id = ${latestSubId}
        ORDER BY sd.document_type
      `;

      console.log(`\n📄 Documents for Latest Submission (${latestSubId}):`);
      console.log('======================\n');
      
      if (docs.length === 0) {
        console.log('❌ No documents found');
      } else {
        for (const doc of docs) {
          console.log(`  ${doc.document_type}`);
          console.log(`    For: ${doc.member_name}`);
          console.log(`    Uploaded by: ${doc.uploader_name}`);
          console.log(`    Date: ${new Date(doc.created_at).toLocaleDateString('id-ID')}\n`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkSubmissions();
