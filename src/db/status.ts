import * as dotenv from 'dotenv';
import { getMaintenanceSql } from './maintenance-client';

dotenv.config({ path: '.env' });

const checkStatus = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = getMaintenanceSql();

  try {
    console.log('\n🔍 Checking database status...\n');

    // Get all tables
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;

    console.log('📊 Database Tables:');
    if (tables.length === 0) {
      console.log('   ⚠️  No tables found. Run migrations first:');
      console.log('   npm run db:generate');
      console.log('   npm run db:push');
    } else {
      tables.forEach((row) => {
        console.log(`   ✓ ${row.tablename}`);
      });
    }
    console.log('');

    // Get enum types
    const enums = await sql`
      SELECT typname 
      FROM pg_type 
      WHERE typcategory = 'E'
      ORDER BY typname;
    `;

    console.log('📋 Enum Types:');
    if (enums.length === 0) {
      console.log('   ⚠️  No enums found');
    } else {
      enums.forEach((row) => {
        console.log(`   ✓ ${row.typname}`);
      });
    }
    console.log('');

    // Count records in main tables
    const mainTables = ['users', 'teams', 'submissions', 'team_members'];
    console.log('📈 Record Counts:');
    
    for (const tableName of mainTables) {
      try {
        const query = `SELECT COUNT(*) as count FROM "${tableName}"`;
        const result = await sql.query(query);
        const count = result[0]?.count || 0;
        console.log(`   ${tableName.padEnd(20)} : ${count} records`);
      } catch (error) {
        const err = error as Error;
        console.log(`   ${tableName.padEnd(20)} : Error - ${err.message}`);
      }
    }
    console.log('');

    console.log('✅ Database check completed!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database check failed:', error);
    process.exit(1);
  }
};

checkStatus();
