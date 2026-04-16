import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import dotenv from "dotenv";

dotenv.config();

const client = neon(process.env.DATABASE_URL!)
const db = drizzle(client);

async function resetDatabase() {
    console.log("Resetting database...");
    await db.execute(`DROP SCHEMA IF EXISTS public CASCADE;`);
    await db.execute(`DROP SCHEMA IF EXISTS drizzle CASCADE;`);
    await db.execute(`CREATE SCHEMA public;`);
    await db.execute(`CREATE SCHEMA drizzle;`);
    await db.execute(`GRANT ALL ON SCHEMA public TO public;`);
    await db.execute(`GRANT ALL ON SCHEMA drizzle TO public;`);
    console.log("Database reset. Successfully recreated public and drizzle schemas.");
}

resetDatabase().catch(console.error);