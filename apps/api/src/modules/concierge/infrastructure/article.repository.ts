import { and, asc, count, eq } from 'drizzle-orm';
import type { Database } from '../../../shared/db/client.js';
import { articles, type ArticleRow } from './concierge.schema.js';

export class ArticleRepository {
  constructor(private readonly db: Database) {}

  async list(hotelId: string, publishedOnly = false): Promise<ArticleRow[]> {
    const conditions = [eq(articles.hotelId, hotelId)];
    if (publishedOnly) conditions.push(eq(articles.isPublished, true));
    return this.db.select().from(articles).where(and(...conditions)).orderBy(asc(articles.title));
  }

  async count(hotelId: string): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(articles).where(eq(articles.hotelId, hotelId));
    return row?.value ?? 0;
  }

  async create(values: typeof articles.$inferInsert): Promise<ArticleRow> {
    const [row] = await this.db.insert(articles).values(values).returning();
    return row!;
  }

  async update(hotelId: string, articleId: string, changes: Partial<typeof articles.$inferInsert>): Promise<ArticleRow | undefined> {
    const [row] = await this.db
      .update(articles)
      .set(changes)
      .where(and(eq(articles.hotelId, hotelId), eq(articles.id, articleId)))
      .returning();
    return row;
  }

  async delete(hotelId: string, articleId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(articles)
      .where(and(eq(articles.hotelId, hotelId), eq(articles.id, articleId)))
      .returning({ id: articles.id });
    return deleted.length > 0;
  }
}
