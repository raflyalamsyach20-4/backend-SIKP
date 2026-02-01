/**
 * Quick Verification: Template Routes Are Working
 * 
 * Run this locally to verify your backend is accessible
 * Usage: npx ts-node verify-template-routes.ts
 */

import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'https://backend-sikp.workers.dev';
const API_BASE = `${BACKEND_URL}/api`;

interface Result {
  endpoint: string;
  method: string;
  status: number;
  statusText: string;
  success: boolean;
  duration: number;
}

const results: Result[] = [];

async function checkEndpoint(
  method: string,
  endpoint: string,
  token?: string
): Promise<Result> {
  const url = `${API_BASE}${endpoint}`;
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      timeout: 10000,
    } as any);

    const duration = Date.now() - startTime;
    const success = response.ok || response.status === 401 || response.status === 403;

    return {
      endpoint,
      method,
      status: response.status,
      statusText: response.statusText || 'OK',
      success,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return {
      endpoint,
      method,
      status: 0,
      statusText: error.message,
      success: false,
      duration,
    };
  }
}

async function verify() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                Template Routes Verification                   ║
║ Backend: ${BACKEND_URL.padEnd(49).substring(0, 50)} ║
╚════════════════════════════════════════════════════════════════╝
  `);

  console.log('Checking routes...\n');

  // Test all template endpoints
  const checks = [
    ['GET', '/templates'],
    ['GET', '/templates/active'],
    ['GET', '/templates/550e8400-e29b-41d4-a716-446655440000'], // dummy ID
    ['POST', '/templates'], // without token = should return 401/403
    ['PUT', '/templates/550e8400-e29b-41d4-a716-446655440000'], // without token
    ['DELETE', '/templates/550e8400-e29b-41d4-a716-446655440000'], // without token
    ['PATCH', '/templates/550e8400-e29b-41d4-a716-446655440000/toggle-active'], // without token
  ];

  for (const [method, endpoint] of checks) {
    const result = await checkEndpoint(method, endpoint);
    results.push(result);

    const statusColor =
      result.status === 0 ? '❌' :
      result.status === 404 ? '❌' :
      result.status >= 400 && result.status < 500 ? '⚠️' : '✅';

    console.log(
      `${statusColor} ${method.padEnd(6)} ${endpoint.padEnd(60)} ${result.status} ${result.statusText} (${result.duration}ms)`
    );
  }

  // Summary
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║                      Summary                                    ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  const working = results.filter(r => r.status !== 0 && r.status !== 404);
  const notFound = results.filter(r => r.status === 404);
  const unreachable = results.filter(r => r.status === 0);

  if (working.length > 0) {
    console.log(`✅ Working Routes: ${working.length}/${results.length}`);
    working.forEach(r => {
      console.log(`   • ${r.method} ${r.endpoint} → ${r.status}`);
    });
  }

  if (notFound.length > 0) {
    console.log(`\n❌ Not Found (404): ${notFound.length}/${results.length}`);
    notFound.forEach(r => {
      console.log(`   • ${r.method} ${r.endpoint}`);
    });
  }

  if (unreachable.length > 0) {
    console.log(`\n❌ Unreachable: ${unreachable.length}/${results.length}`);
    unreachable.forEach(r => {
      console.log(`   • ${r.method} ${r.endpoint}`);
      console.log(`     Error: ${r.statusText}`);
    });
  }

  // Detailed recommendations
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║                   Expected Behavior                            ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  console.log('GET /templates                → 200 OK (get all templates)');
  console.log('GET /templates/active         → 200 OK (get active only)');
  console.log('GET /templates/:id            → 200 OK or 404 (depending on ID)');
  console.log('POST /templates               → 401/403 (no token = unauthorized)');
  console.log('PUT /templates/:id            → 401/403 (no token = unauthorized)');
  console.log('DELETE /templates/:id         → 401/403 (no token = unauthorized)');
  console.log('PATCH /templates/:id/...      → 401/403 (no token = unauthorized)\n');

  // Verdict
  const allGood = notFound.length === 0 && unreachable.length === 0;

  console.log(`╔════════════════════════════════════════════════════════════════╗`);
  if (allGood) {
    console.log(`║ ✅ VERDICT: Backend is working correctly!                      ║`);
    console.log(`║ Your frontend can now safely call these endpoints.             ║`);
  } else {
    console.log(`║ ⚠️  VERDICT: There are issues to fix                           ║`);
    if (notFound.length > 0) {
      console.log(`║ • ${notFound.length} endpoint(s) returned 404                           ║`);
    }
    if (unreachable.length > 0) {
      console.log(`║ • Backend is unreachable (check URL and network)              ║`);
    }
  }
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  return allGood ? 0 : 1;
}

verify()
  .then(code => process.exit(code))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
