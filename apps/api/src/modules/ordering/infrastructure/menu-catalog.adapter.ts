/**
 * WHAT IT DOES:
 * Infrastructure adapter implementing `MenuCatalogPort` by retrieving active menu
 * categories and items from the Menu module's public service.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Adheres strictly to hexagonal architecture and modular boundaries: Ordering
 *   communicates with Menu only through the public `MenuModule` contract.
 * - Flattens categories and item collections from the menu service into raw
 *   `CatalogCategory` and `CatalogItem` structures consumed by `GetGuestMenuUseCase`.
 * - Preserves item availability flags (`isAvailable`) and maps price numbers seamlessly.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import type { MenuModule } from '../../menu/index.js';
import type {
  CatalogCategory,
  CatalogItem,
  MenuCatalogPort,
} from '../application/ports/menu-catalog.port.js';

export class MenuCatalogAdapter implements MenuCatalogPort {
  constructor(private readonly menuModule: Pick<MenuModule, 'menu'>) {}

  /**
   * Retrieves all categories and items for the given hotel from the Menu module.
   */
  public getCatalog = async (
    hotelIdentifier: string
  ): Promise<{
    readonly categories: CatalogCategory[];
    readonly items: CatalogItem[];
  }> => {
    const fullMenuResponse = await this.menuModule.menu.getMenu(hotelIdentifier);

    const categoriesList: CatalogCategory[] = fullMenuResponse.categories.map(
      (menuCategory) => ({
        id: menuCategory.id,
        name: menuCategory.name,
        sortOrder: menuCategory.sortOrder,
      })
    );

    const itemsList: CatalogItem[] = fullMenuResponse.categories.flatMap(
      (menuCategory) =>
        menuCategory.items.map((menuItem) => ({
          id: menuItem.id,
          categoryId: menuItem.categoryId,
          name: menuItem.name,
          description: menuItem.description,
          price: menuItem.price,
          photoUrl: menuItem.photoUrl,
          isAvailable: menuItem.isAvailable,
          isArchived: false,
        }))
    );

    return {
      categories: categoriesList,
      items: itemsList,
    };
  };
}
