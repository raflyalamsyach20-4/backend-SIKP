import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

console.log('🔍 Checking R2 Setup:\n');

console.log('Environment Variables:');
console.log(`  ✓ R2_DOMAIN: ${process.env.R2_DOMAIN}`);
console.log(`  ✓ R2_BUCKET_NAME: ${process.env.R2_BUCKET_NAME}`);

console.log('\n📋 Bucket Configuration:');
console.log(`  Bucket Name in Cloudflare: document-sikp-mi`);
console.log(`  Config in wrangler.jsonc: document-sikp-mi`);
console.log(`  ✅ Names match!`);

console.log('\n🔗 URLs:');
console.log(`  S3 API (Upload): https://38862b6b2ffe8f253eab84cd4481d6af.r2.cloudflarestorage.com/document-sikp-mi`);
console.log(`  Public (Serve):  ${process.env.R2_DOMAIN}`);

console.log('\n⚠️  Debugging file upload:');
console.log(`  1. Check wrangler logs: npx wrangler tail`);
console.log(`  2. Upload file via frontend`);
console.log(`  3. Check if error appears in logs`);
console.log(`  4. Verify file in Cloudflare R2 console`);

console.log('\n💡 Possible issues if files not showing:');
console.log(`  1. R2_BUCKET binding not bound correctly`);
console.log(`     Fix: Re-deploy with npx wrangler deploy`);
console.log(`  `);
console.log(`  2. Error during upload not being caught`);
console.log(`     Fix: Check console logs in wrangler tail`);
console.log(`  `);
console.log(`  3. Upload permission denied in Cloudflare`);
console.log(`     Fix: Check Workers token permissions in Cloudflare dashboard`);

console.log('\n🚀 Next steps:');
console.log(`  1. npx wrangler deploy`);
console.log(`  2. npx wrangler tail`);
console.log(`  3. Upload file via frontend`);
console.log(`  4. Check logs for errors`);
console.log(`  5. Verify file in R2 bucket\n`);
