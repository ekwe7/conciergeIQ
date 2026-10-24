import type { MenuModule } from '../../menu/index.js';
import type { MenuItemPrice, MenuLookup } from '../application/ports/menu-lookup.port.js';

/** Reads current prices through the menu module's public service. */
export class MenuLookupAdapter implements MenuLookup {
  constructor(private readonly menuModule: Pick<MenuModule, 'menu'>) {}

  findItems(hotelId: string, itemIds: string[]): Promise<MenuItemPrice[]> {
    return this.menuModule.menu.findItemsForPricing(hotelId, itemIds);
  }
}
