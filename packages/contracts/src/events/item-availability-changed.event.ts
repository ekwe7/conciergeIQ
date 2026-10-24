import type { EventBase } from './event-base.js';

export interface ItemAvailabilityChangedEvent extends EventBase {
  eventName: 'item.availability_changed';
  itemId: string;
  itemName: string;
  isAvailable: boolean;
}
