import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.js';
import { categories, items, type CategoryRow, type ItemRow, type NewItemRow } from './menu.schema.js';

export class MenuRepository {
  constructor(private readonly db: DbExecutor) {}

  async listCategories(hotelId: string): Promise<CategoryRow[]> {
    return this.db
      .select()
      .from(categories)
      .where(eq(categories.hotelId, hotelId))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async findCategory(hotelId: string, categoryId: string): Promise<CategoryRow | undefined> {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.hotelId, hotelId), eq(categories.id, categoryId)));
    return category;
  }

  async createCategory(hotelId: string, category: { name: string; sortOrder: number }): Promise<CategoryRow> {
    const [created] = await this.db.insert(categories).values({ hotelId, ...category }).returning();
    return created!;
  }

  async updateCategory(
    hotelId: string,
    categoryId: string,
    changes: Partial<Pick<CategoryRow, 'name' | 'sortOrder'>>,
  ): Promise<CategoryRow | undefined> {
    const [updated] = await this.db
      .update(categories)
      .set(changes)
      .where(and(eq(categories.hotelId, hotelId), eq(categories.id, categoryId)))
      .returning();
    return updated;
  }

  async deleteCategory(hotelId: string, categoryId: string): Promise<void> {
    await this.db.delete(categories).where(and(eq(categories.hotelId, hotelId), eq(categories.id, categoryId)));
  }

  async countItemsInCategory(hotelId: string, categoryId: string): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(items)
      .where(and(eq(items.hotelId, hotelId), eq(items.categoryId, categoryId)));
    return result?.value ?? 0;
  }

  async listItems(hotelId: string, itemIds?: string[]): Promise<ItemRow[]> {
    const conditions = [eq(items.hotelId, hotelId)];
    if (itemIds) conditions.push(inArray(items.id, itemIds));
    return this.db.select().from(items).where(and(...conditions)).orderBy(asc(items.name));
  }

  async findItem(hotelId: string, itemId: string): Promise<ItemRow | undefined> {
    const [item] = await this.db
      .select()
      .from(items)
      .where(and(eq(items.hotelId, hotelId), eq(items.id, itemId)));
    return item;
  }

  async createItem(item: NewItemRow): Promise<ItemRow> {
    const [created] = await this.db.insert(items).values(item).returning();
    return created!;
  }

  async updateItem(hotelId: string, itemId: string, changes: Partial<NewItemRow>): Promise<ItemRow | undefined> {
    const [updated] = await this.db
      .update(items)
      .set(changes)
      .where(and(eq(items.hotelId, hotelId), eq(items.id, itemId)))
      .returning();
    return updated;
  }

  async deleteItem(hotelId: string, itemId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(items)
      .where(and(eq(items.hotelId, hotelId), eq(items.id, itemId)))
      .returning({ id: items.id });
    return deleted.length > 0;
  }
}
