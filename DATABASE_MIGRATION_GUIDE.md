# 🗄️ Panduan Migrasi Database dengan Drizzle ORM

## 📋 Table of Contents
1. [Setup Awal](#setup-awal)
2. [Generate Migration](#generate-migration)
3. [Apply Migration](#apply-migration)
4. [Workflow Development](#workflow-development)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

---

## 🚀 Setup Awal

### 1. Pastikan Konfigurasi Database Sudah Benar

**File: `.env`**
```env
DATABASE_URL='postgresql://user:password@host/database?sslmode=require'
JWT_SECRET='your-secret-key'
```

**File: `drizzle.config.ts`**
```typescript
import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

### 2. Verifikasi Schema

**File: `src/db/schema.ts`**

Pastikan semua table schema sudah didefinisikan dengan benar:
```typescript
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  nim: varchar('nim', { length: 20 }).notNull().unique(),
  // ... other fields
});

export const teams = pgTable('teams', {
  id: text('id').primaryKey(),
  // ... other fields
});
```

---

## 📝 Generate Migration

### Step 1: Generate Migration Files

Setiap kali Anda mengubah schema (`src/db/schema.ts`), jalankan:

```bash
npm run db:generate
```

**Atau manual:**
```bash
npx drizzle-kit generate:pg
```

**Output:**
```
drizzle/
├── 0000_initial_schema.sql
├── 0001_add_team_description.sql
└── meta/
    ├── _journal.json
    └── 0000_snapshot.json
```

### Step 2: Review Migration SQL

Buka file SQL yang di-generate untuk review:

```bash
# Windows
notepad drizzle/0000_initial_schema.sql

# VS Code
code drizzle/0000_initial_schema.sql
```

**Contoh Migration File:**
```sql
-- drizzle/0000_initial_schema.sql

CREATE TYPE "role" AS ENUM('MAHASISWA', 'ADMIN');
CREATE TYPE "team_status" AS ENUM('PENDING', 'FIXED');

CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"nim" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	CONSTRAINT "users_nim_unique" UNIQUE("nim"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

-- ... more tables
```

### Step 3: Verifikasi Generated SQL

✅ **Check:**
- Table names sesuai
- Column types benar
- Constraints (UNIQUE, NOT NULL) ada
- Foreign keys terdefinisi dengan benar
- Enums terdefinisi

---

## 🔄 Apply Migration

### Method 1: Push Schema (Development - Recommended)

**Untuk development, gunakan push (lebih cepat):**

```bash
npm run db:push
```

**Atau:**
```bash
npx drizzle-kit push:pg
```

**Kelebihan:**
- ✅ Langsung sync schema tanpa migration files
- ✅ Cepat untuk prototyping
- ✅ Auto-detect schema changes

**Kekurangan:**
- ❌ Tidak ada migration history
- ❌ Tidak bisa rollback
- ❌ Tidak recommended untuk production

**Output:**
```
Applying schema changes...
✓ Tables created
✓ Columns added
✓ Constraints updated
✓ Done!
```

### Method 2: Run Migration (Production - Recommended)

**Untuk production, gunakan migration files:**

```bash
npm run db:migrate
```

**Setup Migration Runner:**

**File: `src/db/migrate.ts`** (Create this file)
```typescript
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const runMigration = async () => {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  console.log('⏳ Running migrations...');

  await migrate(db, { migrationsFolder: './drizzle' });

  console.log('✅ Migrations completed!');
  process.exit(0);
};

runMigration().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
```

**Update `package.json`:**
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate:pg",
    "db:push": "drizzle-kit push:pg",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

**Install dependencies:**
```bash
npm install tsx -D
```

**Run migration:**
```bash
npm run db:migrate
```

---

## 🔧 Workflow Development

### Scenario 1: Setup Database Pertama Kali

```bash
# 1. Clone project
git clone <repo-url>
cd backend-SIKP

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env dengan DATABASE_URL Anda

# 4. Generate migration
npm run db:generate

# 5. Apply migration
npm run db:push
# atau untuk production:
# npm run db:migrate

# 6. Verify dengan Drizzle Studio
npm run db:studio
# Buka http://localhost:4983
```

### Scenario 2: Menambah Field Baru

**Contoh: Tambah field `bio` di table `users`**

**Step 1:** Edit schema
```typescript
// src/db/schema.ts
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  nim: varchar('nim', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  bio: text('bio'), // 👈 Field baru
  // ... other fields
});
```

**Step 2:** Generate migration
```bash
npm run db:generate
```

Output: `drizzle/0001_add_user_bio.sql`
```sql
ALTER TABLE "users" ADD COLUMN "bio" text;
```

**Step 3:** Apply migration
```bash
npm run db:push
```

**Step 4:** Verify
```bash
npm run db:studio
```

### Scenario 3: Menambah Table Baru

**Contoh: Tambah table `announcements`**

**Step 1:** Define schema
```typescript
// src/db/schema.ts
export const announcements = pgTable('announcements', {
  id: text('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const announcementsRelations = relations(announcements, ({ one }) => ({
  author: one(users, {
    fields: [announcements.createdBy],
    references: [users.id],
  }),
}));
```

**Step 2:** Generate & Apply
```bash
npm run db:generate
npm run db:push
```

### Scenario 4: Mengubah Enum

**Contoh: Tambah status baru di `submission_status`**

**Step 1:** Update enum
```typescript
// src/db/schema.ts
export const submissionStatusEnum = pgEnum('submission_status', [
  'DRAFT',
  'MENUNGGU',
  'DITOLAK',
  'DITERIMA',
  'SELESAI', // 👈 Status baru
]);
```

**Step 2:** Generate migration
```bash
npm run db:generate
```

**⚠️ Warning:** Mengubah enum di PostgreSQL butuh handling khusus!

Generated SQL:
```sql
-- Drizzle akan generate ALTER TYPE command
ALTER TYPE "submission_status" ADD VALUE 'SELESAI';
```

**Step 3:** Apply
```bash
npm run db:push
```

### Scenario 5: Rename Column

**⚠️ Hati-hati:** Drizzle akan DROP & CREATE column baru (data hilang!)

**Solusi:** Manual migration

**Step 1:** Generate migration
```bash
npm run db:generate
```

**Step 2:** Edit migration file manual
```sql
-- drizzle/0002_rename_column.sql

-- Jangan biarkan Drizzle DROP column
-- Edit manual:
ALTER TABLE "submissions" RENAME COLUMN "old_name" TO "new_name";
```

**Step 3:** Apply
```bash
npm run db:migrate
```

---

## 📊 Drizzle Studio (Database GUI)

### Buka Studio
```bash
npm run db:studio
```

**URL:** http://localhost:4983

### Fitur Studio:
- ✅ Browse semua tables
- ✅ View data real-time
- ✅ Edit data langsung
- ✅ Run queries
- ✅ See relations
- ✅ Export data

### Tips:
- Gunakan untuk verify migration berhasil
- Check data setelah seeding
- Debug foreign key issues
- Quick data inspection

---

## 🎯 Best Practices

### ✅ DO's

1. **Always Generate Migration Before Push**
   ```bash
   npm run db:generate  # Review SQL first
   npm run db:push      # Then apply
   ```

2. **Review Generated SQL**
   - Buka file di `drizzle/*.sql`
   - Pastikan query aman
   - Check untuk data loss

3. **Backup Database (Production)**
   ```bash
   # Before migration
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
   ```

4. **Test Migration di Development**
   - Test di local database dulu
   - Verify dengan Drizzle Studio
   - Test API endpoints

5. **Use Migration Files for Production**
   ```bash
   # Production
   npm run db:migrate  # NOT db:push
   ```

6. **Version Control Migration Files**
   ```bash
   git add drizzle/
   git commit -m "feat: add bio field to users table"
   ```

### ❌ DON'Ts

1. **Jangan Edit Migration File yang Sudah Dijalankan**
   - Create new migration instead

2. **Jangan Hapus Migration Files**
   - Migration history penting untuk rollback

3. **Jangan Push Langsung ke Production**
   - Always test locally first

4. **Jangan Lupa Backup**
   - Always backup before major changes

5. **Jangan Skip Schema Validation**
   - Always review generated SQL

---

## 🔥 Common Tasks

### Task 1: Reset Database (Development Only)

```bash
# WARNING: This deletes ALL data!

# Method 1: Drop & Recreate (PostgreSQL)
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Method 2: Via Drizzle
npm run db:push -- --force

# Then re-apply migrations
npm run db:push
```

### Task 2: Seed Database

**Create: `src/db/seed.ts`**
```typescript
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { users } from './schema';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env' });

const seed = async () => {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  console.log('🌱 Seeding database...');

  // Insert admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  await db.insert(users).values({
    id: 'admin_001',
    nim: 'ADMIN001',
    name: 'Super Admin',
    email: 'admin@univ.ac.id',
    password: hashedPassword,
    role: 'ADMIN',
  });

  console.log('✅ Seeding completed!');
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
```

**package.json:**
```json
{
  "scripts": {
    "db:seed": "tsx src/db/seed.ts"
  }
}
```

**Run:**
```bash
npm run db:seed
```

### Task 3: Check Migration Status

**Create: `src/db/status.ts`**
```typescript
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const checkStatus = async () => {
  const sql = neon(process.env.DATABASE_URL!);
  
  const result = await sql`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `;

  console.log('\n📊 Database Tables:');
  result.forEach((row) => {
    console.log(`  - ${row.tablename}`);
  });
  
  process.exit(0);
};

checkStatus();
```

**Run:**
```bash
npx tsx src/db/status.ts
```

---

## 🐛 Troubleshooting

### Error: "relation already exists"

**Cause:** Table sudah ada di database

**Solution:**
```bash
# Option 1: Drop table manual
psql $DATABASE_URL -c "DROP TABLE IF EXISTS table_name CASCADE;"

# Option 2: Use db:push dengan force
npm run db:push -- --force

# Option 3: Reset database
# (development only, deletes all data)
```

### Error: "column does not exist"

**Cause:** Migration belum dijalankan atau schema outdated

**Solution:**
```bash
# Re-generate & push
npm run db:generate
npm run db:push

# Or verify with studio
npm run db:studio
```

### Error: "enum value already exists"

**Cause:** Enum value sudah ditambahkan sebelumnya

**Solution:**
```sql
-- Check existing enum values
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = 'submission_status'::regtype;

-- Manual add if needed
ALTER TYPE "submission_status" ADD VALUE IF NOT EXISTS 'NEW_STATUS';
```

### Error: "cannot connect to database"

**Solution:**
```bash
# 1. Check .env
cat .env | grep DATABASE_URL

# 2. Test connection
psql $DATABASE_URL -c "SELECT 1;"

# 3. Check Neon dashboard
# Verify database is active (not suspended)
```

### Error: "foreign key constraint violation"

**Cause:** Trying to insert data with invalid references

**Solution:**
```bash
# 1. Check existing data
npm run db:studio

# 2. Insert parent data first
# 3. Then insert child data

# 4. Or disable constraints temporarily (development only)
ALTER TABLE "table_name" DISABLE TRIGGER ALL;
-- insert data
ALTER TABLE "table_name" ENABLE TRIGGER ALL;
```

---

## 📚 Command Reference

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate migration files from schema |
| `npm run db:push` | Push schema changes (dev) |
| `npm run db:migrate` | Run migrations (prod) |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Seed database with initial data |
| `npx drizzle-kit drop` | Drop migrations (dangerous!) |

---

## 🚀 Production Deployment Checklist

### Pre-Deployment
- [ ] Generate migration: `npm run db:generate`
- [ ] Review SQL files in `drizzle/`
- [ ] Test migration locally
- [ ] Backup production database
- [ ] Test rollback procedure

### Deployment
- [ ] Set DATABASE_URL in production
- [ ] Run: `npm run db:migrate`
- [ ] Verify tables created
- [ ] Test API endpoints
- [ ] Monitor for errors

### Post-Deployment
- [ ] Verify data integrity
- [ ] Check application logs
- [ ] Test critical flows
- [ ] Document changes

---

## 📖 Additional Resources

- **Drizzle Docs:** https://orm.drizzle.team/
- **Neon Docs:** https://neon.tech/docs
- **PostgreSQL Docs:** https://www.postgresql.org/docs/

---

**Last Updated:** 2026-01-13  
**Drizzle Version:** 0.29.3
