export interface UserDeactivatedEvent {
  eventName: 'user.deactivated';
  userId: string;
  hotelId: string;
  deactivatedByUserId: string;
  deactivatedAt: string;
}
