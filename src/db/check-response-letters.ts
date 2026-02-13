import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const checkTable = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    const result = await sql(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns 
       WHERE table_name = 'response_letters'
       ORDER BY ordinal_position`
    );

    console.log('✅ response_letters table structure:');
    console.log(result);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to check table:', error);
    process.exit(1);
  }
};

checkTable();
