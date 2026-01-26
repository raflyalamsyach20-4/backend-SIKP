import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Test if we can access bindings info
console.log('🔍 Checking R2 Configuration:\n');

console.log('Environment Variables:');
console.log(`  R2_DOMAIN: ${process.env.R2_DOMAIN || '❌ NOT SET'}`);
console.log(`  R2_BUCKET_NAME: ${process.env.R2_BUCKET_NAME || '❌ NOT SET'}`);

console.log('\nWrangler Configuration:');
try {
  const wranglerConfig = require('./wrangler.jsonc');
  console.log('  ✅ wrangler.jsonc loaded');
  console.log(`  R2 Binding: ${wranglerConfig.r2_buckets?.[0]?.binding || '❌ NOT FOUND'}`);
  console.log(`  Bucket Name: ${wranglerConfig.r2_buckets?.[0]?.bucket_name || '❌ NOT FOUND'}`);
  console.log(`  R2_DOMAIN var: ${wranglerConfig.vars?.R2_DOMAIN || '❌ NOT FOUND'}`);
  console.log(`  R2_BUCKET_NAME var: ${wranglerConfig.vars?.R2_BUCKET_NAME || '❌ NOT FOUND'}`);
} catch (e) {
  console.log('  ⚠️  wrangler.jsonc could not be parsed (expected for .jsonc)');
}

console.log('\n📝 For production deployment:');
console.log('  1. Build: npx wrangler deploy');
console.log('  2. Verify R2 bucket accessible from Cloudflare Workers');
console.log('  3. Monitor logs: npx wrangler tail\n');

console.log('💡 If files are not uploading to R2:');
console.log('  1. Check R2_BUCKET binding in wrangler.jsonc');
console.log('  2. Verify bucket name matches Cloudflare account');
console.log('  3. Check Cloudflare Workers permissions for R2 access');
console.log('  4. Review console logs during upload for errors');
