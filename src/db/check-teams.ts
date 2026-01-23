import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const checkTeamsColumns = async () => {
  const sql = neon(process.env.DATABASE_URL!);
  
  console.log('\n🔍 Checking TEAMS table columns and data:\n');
  
  try {
    // Check columns
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'teams'
      ORDER BY ordinal_position
    `;
    
    console.log('Columns in teams table:');
    (columns as any).forEach((col: any) => {
      console.log(`  • ${col.column_name} (${col.data_type})`);
    });
    
    // Check data
    console.log('\nData in teams table:');
    const data = await sql`SELECT * FROM "teams"`;
    if ((data as any).length > 0) {
      console.log(`  Found ${(data as any).length} record(s)`);
      (data as any).slice(0, 2).forEach((row: any, idx: number) => {
        console.log(`  Record ${idx + 1}:`, JSON.stringify(row, null, 2));
      });
    } else {
      console.log('  No data');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
};

checkTeamsColumns();
