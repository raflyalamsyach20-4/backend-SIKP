/**
 * Test script untuk verify leaveTeam endpoint
 * Usage: npx tsx test-leave-endpoint.ts <teamId> <userToken>
 */

const BASE_URL = 'http://localhost:8787'; // Adjust sesuai dengan port backend

async function testLeaveEndpoint() {
  const teamId = process.argv[2];
  const token = process.argv[3];
  
  if (!teamId || !token) {
    console.error('❌ Usage: npx tsx test-leave-endpoint.ts <teamId> <userToken>');
    process.exit(1);
  }
  
  console.log(`\n🧪 TEST: Leave Team Endpoint\n`);
  console.log(`Team ID: ${teamId}`);
  console.log(`Token: ${token.substring(0, 20)}...`);
  
  try {
    // 1. Get my teams BEFORE leave
    console.log('\n📊 BEFORE LEAVE - Calling GET /teams/my-teams');
    const beforeRes = await fetch(`${BASE_URL}/api/teams/my-teams`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const beforeData = await beforeRes.json();
    const teamBefore = beforeData.data?.find((t: any) => t.id === teamId);
    console.log(`Team found: ${teamBefore ? '✅ YES' : '❌ NO'}`);
    if (teamBefore) {
      console.log(`Members: ${teamBefore.members.length}`);
    }
    
    // 2. Call leave endpoint
    console.log('\n🗑️ LEAVING TEAM - Calling POST /teams/:teamId/leave');
    const leaveRes = await fetch(`${BASE_URL}/api/teams/${teamId}/leave`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const leaveData = await leaveRes.json();
    console.log(`Status: ${leaveRes.status}`);
    console.log(`Response:`, JSON.stringify(leaveData, null, 2));
    
    if (!leaveRes.ok) {
      console.error('❌ Leave failed');
      process.exit(1);
    }
    
    // 3. Get my teams AFTER leave
    console.log('\n📊 AFTER LEAVE - Calling GET /teams/my-teams');
    const afterRes = await fetch(`${BASE_URL}/api/teams/my-teams`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const afterData = await afterRes.json();
    const teamAfter = afterData.data?.find((t: any) => t.id === teamId);
    console.log(`Team found: ${teamAfter ? '❌ STILL EXISTS' : '✅ GONE'}`);
    if (teamAfter) {
      console.log(`Members: ${teamAfter.members.length}`);
    }
    
    if (teamAfter) {
      console.log('\n❌ ISSUE DETECTED:');
      console.log('- Team still appears in my-teams after leave');
      console.log('- Possible causes:');
      console.log('  1. Member record not deleted from DB');
      console.log('  2. getMyTeams not filtering correctly');
      console.log('  3. Frontend caching');
    } else {
      console.log('\n✅ SUCCESS: Team removed from my-teams!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

testLeaveEndpoint();
