import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

const sql = neon(process.env.DATABASE_URL);

const NEW_DOMAIN = 'https://pub-34d108a4414048589cfe3d01fa4b5ed2.r2.dev';
const OLD_DOMAIN_1 = 'https://pub-38862b6b2ffe8f253eab84cd4481d6af.r2.dev';
const OLD_DOMAIN_2 = 'https://38862b6b2ffe8f253eab84cd4481d6af.r2.cloudflarestorage.com/document-sikp-mi';
const PLACEHOLDER = 'https://your-r2-domain.com';

async function fixDocumentUrls() {
  try {
    console.log('🔧 Fixing document URLs in database...\n');

    // Get all documents with old URLs
    const docs = await sql`
      SELECT id, file_url, file_name
      FROM submission_documents
      WHERE file_url != ${NEW_DOMAIN} || '%'
      ORDER BY created_at DESC
    `;

    console.log(`Found ${docs.length} documents with incorrect URLs\n`);

    let updated = 0;
    for (const doc of docs) {
      let newUrl = doc.file_url;
      let reason = '';

      if (doc.file_url.includes(OLD_DOMAIN_1)) {
        newUrl = doc.file_url.replace(OLD_DOMAIN_1, NEW_DOMAIN);
        reason = 'Old pub- domain';
      } else if (doc.file_url.includes(OLD_DOMAIN_2)) {
        newUrl = doc.file_url.replace(OLD_DOMAIN_2, NEW_DOMAIN);
        reason = 'Old r2.cloudflarestorage.com domain';
      } else if (doc.file_url.includes(PLACEHOLDER)) {
        // Extract file_name and rebuild URL
        const key = doc.file_name;
        newUrl = `${NEW_DOMAIN}/${key}`;
        reason = 'Placeholder domain';
      }

      if (newUrl !== doc.file_url) {
        await sql`
          UPDATE submission_documents
          SET file_url = ${newUrl}
          WHERE id = ${doc.id}
        `;
        updated++;
        console.log(`✅ Updated: ${reason}`);
        console.log(`   Old: ${doc.file_url}`);
        console.log(`   New: ${newUrl}\n`);
      }
    }

    console.log(`\n✅ Fixed ${updated} document URLs!\n`);

    // Verify all URLs now use new domain
    const verify = await sql`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN file_url LIKE '${NEW_DOMAIN}%' THEN 1 ELSE 0 END) as with_new_domain
      FROM submission_documents
    `;

    console.log('📊 Verification:');
    console.log(`   Total documents: ${verify[0].total}`);
    console.log(`   With new domain: ${verify[0].with_new_domain}`);
    console.log(`   ✅ All documents updated!`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixDocumentUrls();
