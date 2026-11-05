/**
 * WHAT IT DOES:
 * Unit test suite for `GetGuestMenuUseCase`.
 * Validates category grouping, alphabetical and sortOrder ordering, real-time availability flags,
 * archived item pruning, and strict hotel tenant isolation.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Uses a typed in-memory `MockMenuCatalogPort` to verify use case business logic
 *   in complete isolation from database and transport layers.
 * - Asserts acceptance criteria: out-of-stock items remain present with `isAvailable: false`,
 *   archived items are filtered out, and categories are sorted deterministically.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import { describe, expect, it } from 'vitest';
import type {
  CatalogCategory,
  CatalogItem,
  MenuCatalogPort,
} from '../../ports/menu-catalog.port.js';
import { GetGuestMenuUseCase } from '../get-guest-menu.use-case.js';

class MockMenuCatalogPort implements MenuCatalogPort {
  private readonly catalogByHotelIdMap = new Map<
    string,
    { categories: CatalogCategory[]; items: CatalogItem[] }
  >();

  public setCatalogForHotel = (
    hotelIdentifier: string,
    categoriesList: CatalogCategory[],
    itemsList: CatalogItem[]
  ): void => {
    this.catalogByHotelIdMap.set(hotelIdentifier, {
      categories: categoriesList,
      items: itemsList,
    });
  };

  public getCatalog = async (
    hotelIdentifier: string
  ): Promise<{
    readonly categories: CatalogCategory[];
    readonly items: CatalogItem[];
  }> => {
    const foundCatalogData = this.catalogByHotelIdMap.get(hotelIdentifier);
    return (
      foundCatalogData ?? {
        categories: [],
        items: [],
      }
    );
  };
}

describe('GetGuestMenuUseCase', () => {
  const HOTEL_ALPHA_IDENTIFIER = 'hotel-alpha-uuid';
  const HOTEL_BETA_IDENTIFIER = 'hotel-beta-uuid';

  const CATEGORY_MAINS: CatalogCategory = {
    id: 'cat-mains-1',
    name: 'Main Courses',
    sortOrder: 2,
  };
  const CATEGORY_STARTERS: CatalogCategory = {
    id: 'cat-starters-2',
    name: 'Appetizers & Starters',
    sortOrder: 1,
  };
  const CATEGORY_DESSERTS: CatalogCategory = {
    id: 'cat-desserts-3',
    name: 'Desserts',
    sortOrder: 3,
  };

  const ITEM_SPRING_ROLLS: CatalogItem = {
    id: 'item-spring-rolls',
    categoryId: CATEGORY_STARTERS.id,
    name: 'Crispy Spring Rolls',
    description: 'Vegetarian spring rolls with sweet chili dip',
    price: 12.5,
    photoUrl: 'https://cdn.test/spring-rolls.jpg',
    isAvailable: true,
  };

  const ITEM_BRUSCHETTA: CatalogItem = {
    id: 'item-bruschetta',
    categoryId: CATEGORY_STARTERS.id,
    name: 'Tomato Bruschetta',
    description: 'Toasted baguette with basil and cherry tomatoes',
    price: 9.0,
    photoUrl: null,
    isAvailable: false, // Out of stock
  };

  const ITEM_STEAK: CatalogItem = {
    id: 'item-steak',
    categoryId: CATEGORY_MAINS.id,
    name: 'Ribeye Steak',
    description: '250g grilled grass-fed beef with peppercorn sauce',
    price: 34.0,
    photoUrl: 'https://cdn.test/steak.jpg',
    isAvailable: true,
  };

  const ITEM_ARCHIVED_BURGER: CatalogItem = {
    id: 'item-archived-burger',
    categoryId: CATEGORY_MAINS.id,
    name: 'Discontinued Burger',
    description: 'Old discontinued recipe',
    price: 18.0,
    photoUrl: null,
    isAvailable: true,
    isArchived: true, // Archived - must be filtered out
  };

  it('groups items into their respective categories and sorts categories by sortOrder ascending', async () => {
    const mockCatalogPortInstance = new MockMenuCatalogPort();
    mockCatalogPortInstance.setCatalogForHotel(
      HOTEL_ALPHA_IDENTIFIER,
      [CATEGORY_MAINS, CATEGORY_STARTERS, CATEGORY_DESSERTS],
      [ITEM_SPRING_ROLLS, ITEM_BRUSCHETTA, ITEM_STEAK]
    );

    const getGuestMenuUseCaseInstance = new GetGuestMenuUseCase(
      mockCatalogPortInstance
    );

    const guestMenuResponse = await getGuestMenuUseCaseInstance.execute({
      hotelId: HOTEL_ALPHA_IDENTIFIER,
    });

    // 3 categories total
    expect(guestMenuResponse.categories).toHaveLength(3);

    // Starters (sortOrder 1) must be first
    expect(guestMenuResponse.categories[0].id).toBe(CATEGORY_STARTERS.id);
    expect(guestMenuResponse.categories[0].name).toBe('Appetizers & Starters');
    expect(guestMenuResponse.categories[0].items).toHaveLength(2);

    // Mains (sortOrder 2) must be second
    expect(guestMenuResponse.categories[1].id).toBe(CATEGORY_MAINS.id);
    expect(guestMenuResponse.categories[1].name).toBe('Main Courses');
    expect(guestMenuResponse.categories[1].items).toHaveLength(1);

    // Desserts (sortOrder 3) must be third and have empty items
    expect(guestMenuResponse.categories[2].id).toBe(CATEGORY_DESSERTS.id);
    expect(guestMenuResponse.categories[2].items).toEqual([]);
  });

  it('preserves out-of-stock items with isAvailable: false flag', async () => {
    const mockCatalogPortInstance = new MockMenuCatalogPort();
    mockCatalogPortInstance.setCatalogForHotel(
      HOTEL_ALPHA_IDENTIFIER,
      [CATEGORY_STARTERS],
      [ITEM_SPRING_ROLLS, ITEM_BRUSCHETTA]
    );

    const getGuestMenuUseCaseInstance = new GetGuestMenuUseCase(
      mockCatalogPortInstance
    );

    const guestMenuResponse = await getGuestMenuUseCaseInstance.execute({
      hotelId: HOTEL_ALPHA_IDENTIFIER,
    });

    const startersItems = guestMenuResponse.categories[0].items;
    const bruschettaItem = startersItems.find(
      (item) => item.id === ITEM_BRUSCHETTA.id
    );
    const springRollsItem = startersItems.find(
      (item) => item.id === ITEM_SPRING_ROLLS.id
    );

    expect(bruschettaItem).toBeDefined();
    expect(bruschettaItem?.isAvailable).toBe(false);
    expect(springRollsItem?.isAvailable).toBe(true);
  });

  it('filters out archived menu items from the guest catalog response', async () => {
    const mockCatalogPortInstance = new MockMenuCatalogPort();
    mockCatalogPortInstance.setCatalogForHotel(
      HOTEL_ALPHA_IDENTIFIER,
      [CATEGORY_MAINS],
      [ITEM_STEAK, ITEM_ARCHIVED_BURGER]
    );

    const getGuestMenuUseCaseInstance = new GetGuestMenuUseCase(
      mockCatalogPortInstance
    );

    const guestMenuResponse = await getGuestMenuUseCaseInstance.execute({
      hotelId: HOTEL_ALPHA_IDENTIFIER,
    });

    const mainsItems = guestMenuResponse.categories[0].items;
    expect(mainsItems).toHaveLength(1);
    expect(mainsItems[0].id).toBe(ITEM_STEAK.id);
    expect(mainsItems.some((item) => item.id === ITEM_ARCHIVED_BURGER.id)).toBe(
      false
    );
  });

  it('sorts items inside each category alphabetically by item name', async () => {
    const mockCatalogPortInstance = new MockMenuCatalogPort();
    // Insert Spring Rolls before Bruschetta in the catalog source
    mockCatalogPortInstance.setCatalogForHotel(
      HOTEL_ALPHA_IDENTIFIER,
      [CATEGORY_STARTERS],
      [ITEM_SPRING_ROLLS, ITEM_BRUSCHETTA]
    );

    const getGuestMenuUseCaseInstance = new GetGuestMenuUseCase(
      mockCatalogPortInstance
    );

    const guestMenuResponse = await getGuestMenuUseCaseInstance.execute(
      HOTEL_ALPHA_IDENTIFIER
    );

    const startersItems = guestMenuResponse.categories[0].items;
    // 'Crispy Spring Rolls' vs 'Tomato Bruschetta' -> C before T
    expect(startersItems[0].name).toBe('Crispy Spring Rolls');
    expect(startersItems[1].name).toBe('Tomato Bruschetta');
  });

  it('strictly scopes catalog retrieval to the requested hotel identifier', async () => {
    const mockCatalogPortInstance = new MockMenuCatalogPort();

    const HOTEL_BETA_CATEGORY: CatalogCategory = {
      id: 'cat-beta-exclusive',
      name: 'Beta Exclusive Buffet',
      sortOrder: 1,
    };
    const HOTEL_BETA_ITEM: CatalogItem = {
      id: 'item-beta-exclusive',
      categoryId: HOTEL_BETA_CATEGORY.id,
      name: 'Beta Lobster Bisque',
      description: 'Exclusive to Hotel Beta guests',
      price: 45.0,
      photoUrl: null,
      isAvailable: true,
    };

    mockCatalogPortInstance.setCatalogForHotel(
      HOTEL_ALPHA_IDENTIFIER,
      [CATEGORY_STARTERS],
      [ITEM_SPRING_ROLLS]
    );

    mockCatalogPortInstance.setCatalogForHotel(
      HOTEL_BETA_IDENTIFIER,
      [HOTEL_BETA_CATEGORY],
      [HOTEL_BETA_ITEM]
    );

    const getGuestMenuUseCaseInstance = new GetGuestMenuUseCase(
      mockCatalogPortInstance
    );

    // Query Hotel Alpha
    const alphaMenuResponse = await getGuestMenuUseCaseInstance.execute({
      hotelId: HOTEL_ALPHA_IDENTIFIER,
    });
    expect(alphaMenuResponse.categories).toHaveLength(1);
    expect(alphaMenuResponse.categories[0].id).toBe(CATEGORY_STARTERS.id);
    expect(
      alphaMenuResponse.categories.some(
        (cat) => cat.id === HOTEL_BETA_CATEGORY.id
      )
    ).toBe(false);

    // Query Hotel Beta
    const betaMenuResponse = await getGuestMenuUseCaseInstance.execute({
      hotelId: HOTEL_BETA_IDENTIFIER,
    });
    expect(betaMenuResponse.categories).toHaveLength(1);
    expect(betaMenuResponse.categories[0].id).toBe(HOTEL_BETA_CATEGORY.id);
    expect(betaMenuResponse.categories[0].items[0].id).toBe(HOTEL_BETA_ITEM.id);
    expect(
      betaMenuResponse.categories.some(
        (cat) => cat.id === CATEGORY_STARTERS.id
      )
    ).toBe(false);
  });
});
