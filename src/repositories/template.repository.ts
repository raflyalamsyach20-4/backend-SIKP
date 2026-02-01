import { eq, and, ilike, desc } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { templates } from '@/db/schema';
import type { Template } from '@/types';

export class TemplateRepository {
  constructor(private db: DbClient) {}

  async findById(id: string): Promise<Template | null> {
    const result = await this.db.select().from(templates).where(eq(templates.id, id)).limit(1);
    return (result[0] as any as Template) || null;
  }

  async findAll(filters?: { type?: string; isActive?: boolean; search?: string }): Promise<Template[]> {
    let query = this.db.select().from(templates) as any;
    const conditions = [];

    if (filters?.type) {
      conditions.push(eq(templates.type, filters.type));
    }

    if (filters?.isActive !== undefined) {
      conditions.push(eq(templates.isActive, filters.isActive));
    }

    if (filters?.search) {
      conditions.push(
        ilike(templates.name, `%${filters.search}%`)
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query.orderBy(desc(templates.createdAt));
    return results as any as Template[];
  }

  async findActive(): Promise<Template[]> {
    const results = await this.db
      .select()
      .from(templates)
      .where(eq(templates.isActive, true))
      .orderBy(desc(templates.createdAt));
    return results as any as Template[];
  }

  async create(data: typeof templates.$inferInsert): Promise<Template> {
    const result = await this.db.insert(templates).values(data).returning();
    return (result[0] as any as Template);
  }

  async update(id: string, data: Partial<typeof templates.$inferInsert>): Promise<Template | null> {
    const result = await this.db
      .update(templates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return (result[0] as any as Template) || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(templates).where(eq(templates.id, id)).returning();
    return result.length > 0;
  }

  async toggleActive(id: string): Promise<Template | null> {
    const template = await this.findById(id);
    if (!template) return null;

    return await this.update(id, { isActive: !template.isActive });
  }

  async findByFileName(fileName: string): Promise<Template | null> {
    const result = await this.db.select().from(templates).where(eq(templates.fileName, fileName)).limit(1);
    return (result[0] as any as Template) || null;
  }
}

