/**
 * Script test: simulasikan alur frontend
 * 1. Ambil session mentor aktif dari DB
 * 2. Fetch TTD dari SSO menggunakan access_token mentor
 * 3. Simpan base64 TTD langsung ke tabel internships via HTTP endpoint
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const envLines = readFileSync(".env", "utf-8").split("\n");
const get = (key) => envLines.find((l) => l.startsWith(key + "="))?.replace(key + "=", "").trim() ?? "";

const dbUrl = get("DATABASE_URL");
const ssoBase = get("SSO_BASE_URL") || "https://sso.unsri.ac.id";
const backendBase = get("API_BASE_URL") || "https://backend-sikp.backend-sikp.workers.dev";

if (!dbUrl) { console.error("DATABASE_URL tidak ditemukan"); process.exit(1); }

const sql = neon(dbUrl);

console.log("=== TEST: SIMPAN TTD MENTOR LANGSUNG KE DB ===\n");
console.log("Backend URL :", backendBase);
console.log("SSO URL     :", ssoBase, "\n");

// 1. Ambil session mentor aktif
const sessions = await sql`
  SELECT session_id, auth_user_id, access_token, active_identity, expires_at
  FROM auth_sessions
  WHERE active_identity = 'MENTOR'
    AND expires_at > NOW()
    AND access_token IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
`;

if (!sessions[0]) {
  console.error("❌ Tidak ada session MENTOR aktif dengan access_token.");
  console.log("   Pastikan mentor sudah login ke SIKP.");
  process.exit(1);
}

const session = sessions[0];
console.log(`✅ Session mentor ditemukan: ${session.session_id.substring(0, 20)}...`);
console.log(`   Aktif hingga: ${session.expires_at}\n`);

// 2. Ambil TTD aktif dari SSO
console.log("📡 Mengambil TTD dari SSO...");
const signaturePath = get("SSO_SIGNATURE_PATH") || "/profile/signature";
let signatureData = null;
let mimeType = "image/png";

try {
  const resp = await fetch(`${ssoBase}${signaturePath}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  console.log(`   SSO response: ${resp.status}`);

  if (resp.ok) {
    const payload = await resp.json();
    const active = payload?.data?.activeSignature || payload?.data;
    const src =
      active?.signatureImage || active?.signatureUrl ||
      active?.url || active?.svg || active?.data || "";

    if (src) {
      let base64 = src;
      if (src.startsWith("data:")) {
        const mimeMatch = src.match(/^data:([^;]+);/);
        if (mimeMatch) mimeType = mimeMatch[1];
        base64 = src.split(",")[1] || src;
      } else if (src.trim().startsWith("<svg")) {
        mimeType = "image/svg+xml";
        base64 = btoa(unescape(encodeURIComponent(src)));
      }
      signatureData = base64;
      console.log(`   ✅ TTD berhasil diambil (mime=${mimeType}, len=${base64.length})`);
    } else {
      console.log("   ⚠️  TTD dari SSO kosong.");
    }
  } else {
    const body = await resp.text();
    console.log(`   ❌ SSO error: ${body.substring(0, 200)}`);
  }
} catch (err) {
  console.error("   ❌ Error fetch SSO:", err.message);
}

if (!signatureData) {
  console.error("\n❌ TTD tidak bisa diambil dari SSO. Cek koneksi dan token.");
  process.exit(1);
}

// 3. Ambil internship yang berhubungan dengan mentor ini
const internshipRows = await sql`
  SELECT id, mahasiswa_id, pembimbing_lapangan_id, status
  FROM internships
  ORDER BY created_at DESC
  LIMIT 1
`;

if (!internshipRows[0]) {
  console.error("❌ Tidak ada data internship.");
  process.exit(1);
}

const internship = internshipRows[0];
console.log(`\n📋 Internship target: ${internship.id}`);
console.log(`   Mahasiswa   : ${internship.mahasiswa_id}`);
console.log(`   Mentor ID   : ${internship.pembimbing_lapangan_id ?? "(null)"}`);

// 4. Simpan langsung ke DB (tanpa HTTP)
console.log("\n💾 Menyimpan TTD langsung ke DB...");

await sql`
  UPDATE internships
  SET
    mentor_signature_base64     = ${signatureData},
    mentor_signature_mime_type  = ${mimeType},
    mentor_signature_cached_at  = NOW(),
    updated_at                  = NOW()
  WHERE id = ${internship.id}
`;

// 5. Verifikasi
const verify = await sql`
  SELECT
    id,
    mentor_signature_base64 IS NOT NULL    AS has_sig,
    mentor_signature_mime_type,
    mentor_signature_cached_at,
    LENGTH(mentor_signature_base64)         AS sig_length
  FROM internships
  WHERE id = ${internship.id}
`;

const v = verify[0];
if (v?.has_sig) {
  console.log("\n✅ BERHASIL! TTD mentor tersimpan di DB:");
  console.log(`   Internship ID  : ${v.id}`);
  console.log(`   Mime Type      : ${v.mentor_signature_mime_type}`);
  console.log(`   Cached At      : ${v.mentor_signature_cached_at}`);
  console.log(`   Panjang base64 : ${v.sig_length} karakter`);
} else {
  console.log("\n❌ Gagal menyimpan TTD ke DB.");
}

console.log("\n=== SELESAI ===");
