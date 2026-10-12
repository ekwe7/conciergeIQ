export interface ItemAvailabilityChangedEvent {
  eventName: 'item.availability_changed';
  hotelId: string;
  itemId: string;
  isAvailable: boolean;
  stockCount?: number;
  updatedByUserId?: string;
  timestamp: string;
}
