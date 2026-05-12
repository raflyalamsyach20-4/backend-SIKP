import { createDbClient } from './src/db';
import { authSessions } from './src/db/schema';

async function debug() {
  const db = createDbClient({} as any); // This might not work without actual env
  // But wait, I can just use a query in a tool if possible.
  // I'll try to find a way to see the data.
}
