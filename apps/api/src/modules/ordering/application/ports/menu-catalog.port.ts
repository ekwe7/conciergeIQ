/**
 * WHAT IT DOES:
 * Hexagonal secondary port defining catalog querying for guest-facing menu browsing.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Decouples guest menu presentation and categorization in the ordering module
 *   from internal database tables or menu management implementations.
 * - Enables unit testing of `GetGuestMenuUseCase` using in-memory mock catalog ports.
 * - Ensures queries are strictly partitioned by `hotelId` to guarantee tenant isolation.
 * - Arrow functions and descriptive variable names are used throughout.
 */

export interface CatalogCategory {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
}

export interface CatalogItem {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string | null;
  readonly price: number;
  readonly photoUrl: string | null;
  readonly isAvailable: boolean;
  readonly isArchived?: boolean;
}

export interface MenuCatalogPort {
  /**
   * Retrieves all categories and active items belonging to the specified hotel.
   */
  getCatalog(hotelId: string): Promise<{
    readonly categories: CatalogCategory[];
    readonly items: CatalogItem[];
  }>;
}
