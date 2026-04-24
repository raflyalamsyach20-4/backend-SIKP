import * as dotenv from 'dotenv';
import { getMaintenanceSql } from './maintenance-client';

dotenv.config();

type TeamsColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
};

type TeamDataRow = Record<string, unknown>;

const checkTeamsColumns = async () => {
  const sql = getMaintenanceSql();
  
  console.log('\n🔍 Checking TEAMS table columns and data:\n');
  
  try {
    // Check columns
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'teams'
      ORDER BY ordinal_position
    `;
    const columnRows = columns as TeamsColumnRow[];
    
    console.log('Columns in teams table:');
    columnRows.forEach((col) => {
      console.log(`  • ${col.column_name} (${col.data_type})`);
    });
    
    // Check data
    console.log('\nData in teams table:');
    const data = await sql`SELECT * FROM "teams"`;
    const teamRows = data as TeamDataRow[];
    if (teamRows.length > 0) {
      console.log(`  Found ${teamRows.length} record(s)`);
      teamRows.slice(0, 2).forEach((row, idx: number) => {
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
