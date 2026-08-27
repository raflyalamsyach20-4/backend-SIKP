/**
 * Script: clear-user-session.ts
 * Usage: tsx scripts/clear-user-session.ts [authUserId or email]
 *
 * Hapus semua sesi aktif user tertentu dari database agar profileSnapshot
 * yang sudah stale (outdated) ikut terhapus.
 * User harus login ulang setelah ini untuk mendapatkan data profil terbaru dari SSO.
 */
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL tidak ditemukan di .env');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  const target = process.argv[2];

  // Tampilkan semua sesi aktif jika tidak ada argumen
  if (!target) {
    const rows = await sql`
      SELECT session_id, auth_user_id, active_identity, expires_at,
             (profile_snapshot->>'fullName') AS full_name,
             updated_at
      FROM auth_sessions
      WHERE expires_at > NOW()
      ORDER BY updated_at DESC
      LIMIT 20
    `;

    if (rows.length === 0) {
      console.log('✅ Tidak ada sesi aktif di database.');
      return;
    }

    console.log(`\n📋 Sesi aktif (${rows.length}):\n`);
    for (const row of rows) {
      console.log(`  session_id  : ${row.session_id}`);
      console.log(`  auth_user_id: ${row.auth_user_id}`);
      console.log(`  identity    : ${row.active_identity}`);
      console.log(`  full_name   : ${row.full_name ?? '(tidak ada snapshot)'}`);
      console.log(`  expires_at  : ${row.expires_at}`);
      console.log('  ---');
    }

    console.log('\n💡 Jalankan dengan argumen auth_user_id untuk hapus sesi user tertentu:');
    console.log('   tsx scripts/clear-user-session.ts <auth_user_id>');
    console.log('\n   Atau hapus SEMUA sesi:');
    console.log('   tsx scripts/clear-user-session.ts ALL\n');
    return;
  }

  if (target === 'ALL') {
    const result = await sql`DELETE FROM auth_sessions RETURNING session_id`;
    console.log(`✅ Semua sesi dihapus: ${result.length} sesi.`);
    console.log('   Semua user perlu login ulang untuk mendapatkan profil terbaru dari SSO.');
    return;
  }

  // Cari sesi berdasarkan auth_user_id
  const sessions = await sql`
    SELECT session_id, auth_user_id, active_identity,
           (profile_snapshot->>'fullName') AS full_name,
           expires_at
    FROM auth_sessions
    WHERE auth_user_id = ${target}
    ORDER BY updated_at DESC
  `;

  if (sessions.length === 0) {
    console.log(`⚠️  Tidak ditemukan sesi untuk auth_user_id: ${target}`);
    console.log('   Jalankan tanpa argumen untuk melihat semua sesi aktif.');
    return;
  }

  console.log(`\n🔍 Ditemukan ${sessions.length} sesi untuk ${target}:`);
  for (const s of sessions) {
    console.log(`   - ${s.session_id} | identity: ${s.active_identity} | nama di snapshot: ${s.full_name}`);
  }

  const deleted = await sql`
    DELETE FROM auth_sessions
    WHERE auth_user_id = ${target}
    RETURNING session_id
  `;

  console.log(`\n✅ ${deleted.length} sesi berhasil dihapus!`);
  console.log(`   User "${target}" harus login ulang. Data profil terbaru akan diambil dari SSO.\n`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
