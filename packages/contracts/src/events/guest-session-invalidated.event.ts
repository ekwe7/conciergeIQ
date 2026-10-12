export interface GuestSessionInvalidatedEvent {
  eventName: 'guest_session.invalidated';
  sessionId: string;
  hotelId: string;
  roomId: string;
  reason: 'checked_out' | 'expired' | 'manual_revocation';
  invalidatedAt: string;
}
