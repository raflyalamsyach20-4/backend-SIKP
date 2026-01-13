# 🚀 Drizzle Migration Quick Reference

## 📌 Common Commands

```bash
# Generate migration files from schema changes
npm run db:generate

# Push schema to database (Development)
npm run db:push

# Run migrations (Production)
npm run db:migrate

# Open Drizzle Studio (Database GUI)
npm run db:studio

# Seed database with initial data
npm run db:seed

# Check database status
npm run db:status
```

---

## 🔄 Typical Workflow

### First Time Setup
```bash
npm install           # Install dependencies
npm run db:generate   # Generate migration files
npm run db:push       # Apply to database
npm run db:seed       # Insert initial data
npm run db:studio     # Verify in GUI
```

### Adding New Feature
```bash
# 1. Edit src/db/schema.ts
# 2. Generate migration
npm run db:generate

# 3. Review SQL in drizzle/*.sql
# 4. Apply changes
npm run db:push

# 5. Verify
npm run db:studio
```

---

## 📝 Schema Examples

### Add New Column
```typescript
export const users = pgTable('users', {
  // ... existing columns
  bio: text('bio'), // 👈 New field
});
```

### Add New Table
```typescript
export const announcements = pgTable('announcements', {
  id: text('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Add New Enum Value
```typescript
export const submissionStatusEnum = pgEnum('submission_status', [
  'DRAFT',
  'MENUNGGU',
  'DITOLAK',
  'DITERIMA',
  'SELESAI', // 👈 New value
]);
```

---

## 🎯 Quick Troubleshooting

| Error | Solution |
|-------|----------|
| "relation already exists" | `npm run db:push -- --force` |
| "column does not exist" | `npm run db:generate && npm run db:push` |
| "cannot connect" | Check `.env` DATABASE_URL |
| "enum already exists" | Edit migration SQL manually |

---

## 🔧 Development vs Production

| Task | Development | Production |
|------|-------------|------------|
| Apply Schema | `npm run db:push` | `npm run db:migrate` |
| Rollback | Reset database | Keep migration history |
| Speed | Fast | Slower but safer |

---

## 📚 Read Full Guide

See [DATABASE_MIGRATION_GUIDE.md](DATABASE_MIGRATION_GUIDE.md) for complete documentation.
