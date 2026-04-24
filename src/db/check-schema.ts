import * as dotenv from 'dotenv';
import { getMaintenanceSql } from './maintenance-client';

dotenv.config({ path: '.env' });

type ColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default?: string | null;
};

type LegacyColumnRow = {
  column_name: string;
};

const checkSchema = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sqlClient = getMaintenanceSql();

  console.log('\n📋 Database Schema Verification\n');
  console.log('='.repeat(80));

  try {
    // Check users table columns
    const usersColumns = await sqlClient`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;
    const userColumnRows = usersColumns as ColumnRow[];

    console.log('\n✅ USERS TABLE COLUMNS:');
    console.log('-'.repeat(80));
    userColumnRows.forEach((col) => {
      const nullable = col.is_nullable === 'YES' ? '[NULLABLE]' : '[NOT NULL]';
      const defaultVal = col.column_default ? ` DEFAULT: ${col.column_default}` : '';
      console.log(`  • ${col.column_name.padEnd(20)} | ${col.data_type.padEnd(20)} | ${nullable}${defaultVal}`);
    });

    // Check mahasiswa table
    const mahasiswaColumns = await sqlClient`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'mahasiswa'
      ORDER BY ordinal_position
    `;
    const mahasiswaColumnRows = mahasiswaColumns as ColumnRow[];

    console.log('\n✅ MAHASISWA TABLE COLUMNS:');
    console.log('-'.repeat(80));
    mahasiswaColumnRows.forEach((col) => {
      const nullable = col.is_nullable === 'YES' ? '[NULLABLE]' : '[NOT NULL]';
      console.log(`  • ${col.column_name.padEnd(20)} | ${col.data_type.padEnd(20)} | ${nullable}`);
    });

    // Check if old columns still exist
    const oldColumnsCheck = await sqlClient`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('nim', 'name', 'faculty', 'major', 'semester')
    `;
    const legacyColumns = oldColumnsCheck as LegacyColumnRow[];

    console.log('\n🔍 OLD COLUMNS CHECK:');
    console.log('-'.repeat(80));
    if (legacyColumns.length === 0) {
      console.log('  ✅ No old columns found - Schema is clean!');
    } else {
      console.log('  ⚠️  Found old columns that need to be removed:');
      legacyColumns.forEach((col) => {
        console.log(`    • ${col.column_name}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('Schema verification completed!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking schema:', error);
    process.exit(1);
  }
};

checkSchema();
