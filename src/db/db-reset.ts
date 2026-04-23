import { sql } from 'drizzle-orm';
import dotenv from "dotenv";
import { getMaintenanceDb } from './maintenance-client';

dotenv.config();

const db = getMaintenanceDb();

async function resetDatabase() {
    console.log("Resetting database...");
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    await db.execute(sql`CREATE SCHEMA drizzle`);
    await db.execute(sql`GRANT ALL ON SCHEMA public TO public`);
    await db.execute(sql`GRANT ALL ON SCHEMA drizzle TO public`);
    console.log("Database reset. Successfully recreated public and drizzle schemas.");
}

resetDatabase().catch(console.error);