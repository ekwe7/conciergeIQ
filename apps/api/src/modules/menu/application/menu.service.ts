import type {
  CreateMenuCategoryInput,
  CreateMenuItemInput,
  GetMenuResponse,
  GuestMenu,
  GuestMenuItem,
  Language,
  MenuCategory,
  MenuItem,
  UpdateMenuCategoryInput,
  UpdateMenuItemInput,
} from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import type { Clock } from '../../../shared/utils/clock.js';
import { toMajorUnits, toMinorUnits } from '../../../shared/domain/money.js';
import type { Outbox } from '../../../shared/events/outbox.repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { actorOf, type SignedInStaff } from '../../identity/index.js';
import { MenuRepository } from '../infrastructure/menu.repository.js';
import type { CategoryRow, ItemRow } from '../infrastructure/menu.schema.js';
import { localizeCategoryName, localizeItem } from '../domain/localize.js';
import { isServedAt, localTimeIn } from '../domain/service-hours.js';

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
    isFeatured: item.isFeatured,
    pairsWith: item.pairsWith,
    translations: item.translations,
  };
}

function toMenuCategory(category: CategoryRow, isOpenNow: boolean, items: MenuItem[] = []): MenuCategory {
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    availableFrom: category.availableFrom,
    availableUntil: category.availableUntil,
    isOpenNow,
    translations: category.translations,
    items,
  };
}

export class MenuService {
  constructor(
    private readonly db: Database,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
    /** The hotel's IANA time zone, for breakfast / lunch / late-night hours. */
    private readonly timezoneOf: (hotelId: string) => Promise<string>,
  ) {}

  async getMenu(hotelId: string): Promise<GetMenuResponse> {
    const repository = new MenuRepository(this.db);
    const [categories, items, isServed] = await Promise.all([
      repository.listCategories(hotelId),
      repository.listItems(hotelId),
      this.servedNow(hotelId),
    ]);

    return {
      categories: categories.map((category) =>
        toMenuCategory(
          category,
          isServed(category),
          items.filter((item) => item.categoryId === category.id).map(toMenuItem),
        ),
      ),
    };
  }

  /**
   * The menu as a guest sees it: in their language, categories being served
   * now first, featured items on top, and only suggestions that can be ordered.
   */
  async getGuestMenu(hotelId: string, language: Language): Promise<GuestMenu> {
    const repository = new MenuRepository(this.db);
    const [categories, items, isServed] = await Promise.all([
      repository.listCategories(hotelId),
      repository.listItems(hotelId),
      this.servedNow(hotelId),
    ]);
    const openCategoryIds = new Set(categories.filter(isServed).map((category) => category.id));
    const orderable = new Set(items.filter((item) => item.isAvailable && openCategoryIds.has(item.categoryId)).map((item) => item.id));

    const toGuestItem = (item: ItemRow): GuestMenuItem => ({
      id: item.id,
      categoryId: item.categoryId,
      ...localizeItem(item, language),
      price: toMajorUnits(item.priceMinor),
      photoUrl: item.photoUrl,
      isAvailable: orderable.has(item.id),
      isFeatured: item.isFeatured,
      pairsWith: item.pairsWith.filter((id) => orderable.has(id)),
    });

    const guestCategories = categories
      .map((category) => ({
        id: category.id,
        name: localizeCategoryName(category, language),
        availableFrom: category.availableFrom,
        availableUntil: category.availableUntil,
        isOpenNow: openCategoryIds.has(category.id),
        items: items.filter((item) => item.categoryId === category.id).map(toGuestItem),
      }))
      .filter((category) => category.items.length > 0)
      .sort((a, b) => Number(b.isOpenNow) - Number(a.isOpenNow));

    return {
      language,
      featured: items.filter((item) => item.isFeatured && orderable.has(item.id)).map(toGuestItem),
      categories: guestCategories,
    };
  }

  async createCategory(hotelId: string, input: CreateMenuCategoryInput): Promise<MenuCategory> {
    const category = await new MenuRepository(this.db).createCategory(hotelId, input);
    return toMenuCategory(category, (await this.servedNow(hotelId))(category));
  }

  async updateCategory(hotelId: string, categoryId: string, changes: UpdateMenuCategoryInput): Promise<MenuCategory> {
    const category = await new MenuRepository(this.db).updateCategory(hotelId, categoryId, changes);
    if (!category) throw new NotFoundError('Category');
    return toMenuCategory(category, (await this.servedNow(hotelId))(category));
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
    await this.requirePairings(repository, hotelId, input.pairsWith);

    const { price, ...item } = input;
    return toMenuItem(await repository.createItem({ ...item, hotelId, priceMinor: toMinorUnits(price) }));
  }

  async updateItem(hotelId: string, itemId: string, changes: UpdateMenuItemInput): Promise<MenuItem> {
    const repository = new MenuRepository(this.db);
    if (changes.categoryId) await this.requireCategory(repository, hotelId, changes.categoryId);
    if (changes.pairsWith) await this.requirePairings(repository, hotelId, changes.pairsWith, itemId);

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

  /** Items outside their category's service hours count as unavailable, so they cannot be ordered. */
  async findItemsForPricing(hotelId: string, itemIds: string[]): Promise<PricedMenuItem[]> {
    const repository = new MenuRepository(this.db);
    const [items, categories, isServed] = await Promise.all([
      repository.listItems(hotelId, itemIds),
      repository.listCategories(hotelId),
      this.servedNow(hotelId),
    ]);
    const closed = new Set(categories.filter((category) => !isServed(category)).map((category) => category.id));
    return items.map(({ id, name, priceMinor, isAvailable, categoryId }) => ({
      id,
      name,
      priceMinor,
      isAvailable: isAvailable && !closed.has(categoryId),
    }));
  }

  private async servedNow(hotelId: string): Promise<(category: Pick<CategoryRow, 'availableFrom' | 'availableUntil'>) => boolean> {
    const localTime = localTimeIn(this.clock.now(), await this.timezoneOf(hotelId));
    return (category) => isServedAt(category.availableFrom, category.availableUntil, localTime);
  }

  /** Suggested items must be other items on the same hotel's menu. */
  private async requirePairings(repository: MenuRepository, hotelId: string, pairsWith: string[], itemId?: string): Promise<void> {
    if (pairsWith.length === 0) return;
    if (itemId && pairsWith.includes(itemId)) throw new ValidationError('An item cannot be suggested with itself');
    const found = await repository.listItems(hotelId, [...new Set(pairsWith)]);
    if (found.length !== new Set(pairsWith).size) throw new ValidationError('A suggested item is not on this menu');
  }

  private async requireCategory(repository: MenuRepository, hotelId: string, categoryId: string): Promise<void> {
    if (!(await repository.findCategory(hotelId, categoryId))) throw new NotFoundError('Category');
  }
}
