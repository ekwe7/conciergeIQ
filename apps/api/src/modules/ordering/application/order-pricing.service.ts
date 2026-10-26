import type { OrderItemInput } from '@conciergeiq/contracts';
import { DomainRuleError } from '../../../shared/domain/domain-rule-error.js';
import type { OrderItem } from '../domain/order-item.js';
import type { MenuItemPrice } from './ports/menu-lookup.port.js';

/** Prices requested items from the menu. Any price the client sent is ignored. */
export function priceOrderItems(requested: OrderItemInput[], menuItems: MenuItemPrice[]): OrderItem[] {
  return requested.map((line) => {
    const menuItem = menuItems.find((item) => item.id === line.itemId);
    if (!menuItem) throw new DomainRuleError('One of the items is not on the menu');
    if (!menuItem.isAvailable) throw new DomainRuleError(`${menuItem.name} is not available right now`);

    return {
      itemId: menuItem.id,
      name: menuItem.name,
      unitPriceMinor: menuItem.priceMinor,
      quantity: line.quantity,
      notes: line.notes,
    };
  });
}
