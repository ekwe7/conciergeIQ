/**
 * WHAT IT DOES:
 * Application use case that retrieves, categorizes, and formats menu catalog items
 * for guest-facing mobile browsing scoped to an authenticated guest stay.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Menu browsing is the entry point for in-room guest ordering; data must be accurate,
 *   localized, and properly scoped to the guest's hotel (`hotelId`).
 * - Filters out archived menu items while retaining active out-of-stock items
 *   flagged with `isAvailable: false` so guests are informed what items the kitchen offers
 *   even when currently unavailable.
 * - Deterministically groups items under their corresponding categories sorted by `sortOrder`
 *   and category name.
 * - Returns a clean `GetMenuResponse` adhering to shared contracts without leaking internal database schemas.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import type { GetMenuResponse, MenuCategory, MenuItem } from '@conciergeiq/contracts';
import type { MenuCatalogPort } from '../ports/menu-catalog.port.js';

export interface GetGuestMenuQuery {
  readonly hotelId: string;
}

export class GetGuestMenuUseCase {
  constructor(private readonly menuCatalogPort: MenuCatalogPort) {}

  /**
   * Executes menu retrieval for the guest's hotel, grouping active items under their categories.
   */
  public execute = async (
    queryOrHotelId: GetGuestMenuQuery | string
  ): Promise<GetMenuResponse> => {
    const targetHotelIdentifier =
      typeof queryOrHotelId === 'string'
        ? queryOrHotelId
        : queryOrHotelId.hotelId;

    const rawCatalogData = await this.menuCatalogPort.getCatalog(targetHotelIdentifier);

    // Filter out archived items; retain active items (including isAvailable: false)
    const activeCatalogItemsList = rawCatalogData.items.filter(
      (catalogItem) => catalogItem.isArchived !== true
    );

    // Group items by category identifier
    const itemsGroupedByCategoryIdMap = new Map<string, MenuItem[]>();
    for (const activeItem of activeCatalogItemsList) {
      const existingCategoryItems =
        itemsGroupedByCategoryIdMap.get(activeItem.categoryId) ?? [];

      existingCategoryItems.push({
        id: activeItem.id,
        categoryId: activeItem.categoryId,
        name: activeItem.name,
        description: activeItem.description ?? null,
        price: activeItem.price,
        photoUrl: activeItem.photoUrl ?? null,
        isAvailable: activeItem.isAvailable,
      });

      itemsGroupedByCategoryIdMap.set(activeItem.categoryId, existingCategoryItems);
    }

    // Sort categories deterministically: primary by sortOrder ascending, secondary by name
    const sortedCategoriesList: MenuCategory[] = [...rawCatalogData.categories]
      .sort((categoryA, categoryB) => {
        if (categoryA.sortOrder !== categoryB.sortOrder) {
          return categoryA.sortOrder - categoryB.sortOrder;
        }
        return categoryA.name.localeCompare(categoryB.name);
      })
      .map((sortedCategory) => {
        const categoryItemsList =
          itemsGroupedByCategoryIdMap.get(sortedCategory.id) ?? [];

        // Sort items inside each category alphabetically by name
        categoryItemsList.sort((itemA, itemB) => itemA.name.localeCompare(itemB.name));

        return {
          id: sortedCategory.id,
          name: sortedCategory.name,
          sortOrder: sortedCategory.sortOrder,
          items: categoryItemsList,
        };
      });

    return {
      categories: sortedCategoriesList,
    };
  };
}
