import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const envLines = readFileSync(".env", "utf-8").split("\n");
const dbUrlLine = envLines.find((l) => l.startsWith("DATABASE_URL="));
const dbUrl = dbUrlLine?.replace("DATABASE_URL=", "").trim();
if (!dbUrl) { console.error("DATABASE_URL tidak ditemukan"); process.exit(1); }

const sql = neon(dbUrl);

console.log("=== DEBUG: CACHE TTD MENTOR ===\n");

// 1. Cek status cache di DB
const rows = await sql`
  SELECT
    id,
    mahasiswa_id,
    pembimbing_lapangan_id,
    status,
    mentor_signature_base64 IS NOT NULL            AS has_signature,
    mentor_signature_mime_type,
    mentor_signature_cached_at
  FROM internships
  ORDER BY created_at DESC
  LIMIT 10
`;

if (rows.length === 0) {
  console.log("❌ Tidak ada data internship.");
  process.exit(0);
}

console.log("📋 Status internship:\n");
rows.forEach((r, i) => {
  const status = r.has_signature ? "✅ CACHE ADA" : "❌ CACHE KOSONG";
  console.log(`[${i+1}] ${status}`);
  console.log(`    internship_id         : ${r.id}`);
  console.log(`    mahasiswa_id          : ${r.mahasiswa_id}`);
  console.log(`    pembimbing_lapangan_id: ${r.pembimbing_lapangan_id ?? "(null)"}`);
  console.log(`    status magang         : ${r.status}`);
  if (r.has_signature) {
    console.log(`    mime_type             : ${r.mentor_signature_mime_type}`);
    console.log(`    cached_at             : ${r.mentor_signature_cached_at}`);
  }
  console.log("");
});

// 2. Cek logbook yang baru diapprove (apakah ada yang diapprove hari ini)
console.log("=== LOGBOOK YANG BARU DIAPPROVE ===\n");
const recentApproved = await sql`
  SELECT
    l.id        AS logbook_id,
    l.status,
    l.verified_by,
    l.verified_at,
    l.internship_id,
    i.pembimbing_lapangan_id,
    i.mentor_signature_base64 IS NOT NULL AS has_cache
  FROM logbooks l
  JOIN internships i ON l.internship_id = i.id
  WHERE l.status = 'APPROVED'
  ORDER BY l.verified_at DESC NULLS LAST
  LIMIT 5
`;

if (recentApproved.length === 0) {
  console.log("⚠️  Tidak ada logbook yang sudah diapprove.");
} else {
  recentApproved.forEach((l, i) => {
    console.log(`[${i+1}] Logbook ID    : ${l.logbook_id}`);
    console.log(`    Status        : ${l.status}`);
    console.log(`    Diapprove oleh: ${l.verified_by ?? "(null)"}`);
    console.log(`    Waktu approve : ${l.verified_at ?? "(null)"}`);
    console.log(`    Internship ID : ${l.internship_id}`);
    console.log(`    Mentor ID     : ${l.pembimbing_lapangan_id ?? "(null)"}`);
    console.log(`    Has Cache TTD : ${l.has_cache ? "✅ YA" : "❌ TIDAK"}`);
    console.log("");
  });
}

// 3. Cek apakah ada auth_sessions dengan sessionId aktif (untuk mentor)
console.log("=== SESSION MENTOR AKTIF ===\n");
const sessions = await sql`
  SELECT
    session_id,
    auth_user_id,
    active_identity,
    expires_at,
    NOW() < expires_at AS is_valid
  FROM auth_sessions
  WHERE expires_at > NOW() - INTERVAL '1 day'
  ORDER BY created_at DESC
  LIMIT 5
`;

if (sessions.length === 0) {
  console.log("⚠️  Tidak ada session aktif ditemukan.");
} else {
  sessions.forEach((s, i) => {
    console.log(`[${i+1}] session_id     : ${s.session_id.substring(0, 20)}...`);
    console.log(`    auth_user_id   : ${s.auth_user_id}`);
    console.log(`    active_identity: ${s.active_identity}`);
    console.log(`    expires_at     : ${s.expires_at}`);
    console.log(`    masih valid    : ${s.is_valid ? "✅ YA" : "❌ EXPIRED"}`);
    console.log("");
  });
}

console.log("=== SELESAI ===");
