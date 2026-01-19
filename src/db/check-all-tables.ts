import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const checkTableStructure = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('\n' + '='.repeat(100));
  console.log('📊 COMPLETE DATABASE STRUCTURE CHECK');
  console.log('='.repeat(100));

  const tables = [
    'users',
    'mahasiswa',
    'admin',
    'dosen',
    'pembimbing_lapangan',
    'teams',
    'team_members',
    'submissions',
    'submission_documents',
    'generated_letters'
  ];

  for (const tableName of tables) {
    try {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = ${tableName}
        ORDER BY ordinal_position
      `;

      console.log(`\n📋 TABLE: "${tableName}"`);
      console.log('-'.repeat(100));

      if ((columns as any).length === 0) {
        console.log(`  ⚠️  Table tidak ditemukan atau tidak memiliki kolom`);
      } else {
        (columns as any).forEach((col: any) => {
          const nullable = col.is_nullable === 'YES' ? '[NULL]' : '[NOT NULL]';
          const defaultVal = col.column_default ? ` DEFAULT: ${col.column_default}` : '';
          console.log(
            `  • ${col.column_name.padEnd(25)} | ${col.data_type.padEnd(25)} | ${nullable}${defaultVal}`
          );
        });
      }
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(100) + '\n');
  process.exit(0);
};

checkTableStructure().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
