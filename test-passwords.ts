import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function testPasswords() {
  console.log('🔐 Testing passwords...\n');

  // Test seed password
  const seedPassword = 'password123';
  const seedHash = await bcrypt.hash(seedPassword, 10);
  console.log(`Seed password: ${seedPassword}`);
  console.log(`Seed hash: ${seedHash}`);

  // Test admin password
  const adminPassword = 'admin123';
  const adminHash = await bcrypt.hash(adminPassword, 10);
  console.log(`\nAdmin password: ${adminPassword}`);
  console.log(`Admin hash: ${adminHash}`);

  // Get users from DB
  console.log('\n═══════════════════════════\n');

  const users = await sql`
    SELECT email, password FROM users LIMIT 5
  `;

  for (const user of users) {
    console.log(`\n📧 ${user.email}`);
    console.log(`   Hash: ${user.password}`);

    // Test with seed password
    const matchSeed = await bcrypt.compare(seedPassword, user.password);
    console.log(`   Matches 'password123': ${matchSeed}`);

    // Test with admin password
    const matchAdmin = await bcrypt.compare(adminPassword, user.password);
    console.log(`   Matches 'admin123': ${matchAdmin}`);
  }
}

testPasswords();
