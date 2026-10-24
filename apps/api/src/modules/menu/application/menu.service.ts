import type {
  CreateMenuCategoryInput,
  CreateMenuItemInput,
  GetMenuResponse,
  MenuCategory,
  MenuItem,
  UpdateMenuCategoryInput,
  UpdateMenuItemInput,
} from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import type { Clock } from '../../../shared/utils/clock.js';
import { toMajorUnits, toMinorUnits } from '../../../shared/domain/money.js';
import type { Outbox } from '../../../shared/events/outbox.repository.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { actorOf, type SignedInStaff } from '../../identity/index.js';
import { MenuRepository } from '../infrastructure/menu.repository.js';
import type { CategoryRow, ItemRow } from '../infrastructure/menu.schema.js';

/** What the ordering module needs to price an order on the server. */
export interface PricedMenuItem {
  id: string;
  name: string;
  priceMinor: number;
  isAvailable: boolean;
}

function toMenuItem(item: ItemRow): MenuItem {
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    price: toMajorUnits(item.priceMinor),
    photoUrl: item.photoUrl,
    isAvailable: item.isAvailable,
  };
}

function toMenuCategory(category: CategoryRow, items: MenuItem[] = []): MenuCategory {
  return { id: category.id, name: category.name, sortOrder: category.sortOrder, items };
}

export class MenuService {
  constructor(
    private readonly db: Database,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
  ) {}

  async getMenu(hotelId: string): Promise<GetMenuResponse> {
    const repository = new MenuRepository(this.db);
    const [categories, items] = await Promise.all([repository.listCategories(hotelId), repository.listItems(hotelId)]);

    return {
      categories: categories.map((category) =>
        toMenuCategory(
          category,
          items.filter((item) => item.categoryId === category.id).map(toMenuItem),
        ),
      ),
    };
  }

  async createCategory(hotelId: string, input: CreateMenuCategoryInput): Promise<MenuCategory> {
    return toMenuCategory(await new MenuRepository(this.db).createCategory(hotelId, input));
  }

  async updateCategory(hotelId: string, categoryId: string, changes: UpdateMenuCategoryInput): Promise<MenuCategory> {
    const category = await new MenuRepository(this.db).updateCategory(hotelId, categoryId, changes);
    if (!category) throw new NotFoundError('Category');
    return toMenuCategory(category);
  }

  async deleteCategory(hotelId: string, categoryId: string): Promise<void> {
    const repository = new MenuRepository(this.db);
    if (!(await repository.findCategory(hotelId, categoryId))) throw new NotFoundError('Category');
    if ((await repository.countItemsInCategory(hotelId, categoryId)) > 0) {
      throw new ConflictError('Move or delete the items in this category first');
    }
    await repository.deleteCategory(hotelId, categoryId);
  }

  async createItem(hotelId: string, input: CreateMenuItemInput): Promise<MenuItem> {
    const repository = new MenuRepository(this.db);
    await this.requireCategory(repository, hotelId, input.categoryId);

    const { price, ...item } = input;
    return toMenuItem(await repository.createItem({ ...item, hotelId, priceMinor: toMinorUnits(price) }));
  }

  async updateItem(hotelId: string, itemId: string, changes: UpdateMenuItemInput): Promise<MenuItem> {
    const repository = new MenuRepository(this.db);
    if (changes.categoryId) await this.requireCategory(repository, hotelId, changes.categoryId);

    const { price, ...rest } = changes;
    const priceChange = price === undefined ? {} : { priceMinor: toMinorUnits(price) };
    const item = await repository.updateItem(hotelId, itemId, { ...rest, ...priceChange });
    if (!item) throw new NotFoundError('Menu item');
    return toMenuItem(item);
  }

  async deleteItem(hotelId: string, itemId: string): Promise<void> {
    const deleted = await new MenuRepository(this.db).deleteItem(hotelId, itemId);
    if (!deleted) throw new NotFoundError('Menu item');
  }

  /** The one-tap "mark unavailable" switch. Guests and the live board hear about it straight away. */
  async setAvailability(actor: SignedInStaff, itemId: string, isAvailable: boolean): Promise<MenuItem> {
    return this.db.transaction(async (tx) => {
      const repository = new MenuRepository(tx);
      const current = await repository.findItem(actor.hotelId, itemId);
      if (!current) throw new NotFoundError('Menu item');
      if (current.isAvailable === isAvailable) return toMenuItem(current);

      const updated = await repository.updateItem(actor.hotelId, itemId, { isAvailable });
      await this.outbox.record(tx, {
        eventName: 'item.availability_changed',
        hotelId: actor.hotelId,
        occurredAt: this.clock.now().toISOString(),
        actor: actorOf(actor),
        itemId,
        itemName: current.name,
        isAvailable,
      });
      return toMenuItem(updated!);
    });
  }

  async findItemsForPricing(hotelId: string, itemIds: string[]): Promise<PricedMenuItem[]> {
    const items = await new MenuRepository(this.db).listItems(hotelId, itemIds);
    return items.map(({ id, name, priceMinor, isAvailable }) => ({ id, name, priceMinor, isAvailable }));
  }

  private async requireCategory(repository: MenuRepository, hotelId: string, categoryId: string): Promise<void> {
    if (!(await repository.findCategory(hotelId, categoryId))) throw new NotFoundError('Category');
  }
}
