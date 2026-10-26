import type { EventBase } from './event-base.js';

export interface GuestSessionInvalidatedEvent extends EventBase {
  eventName: 'guest_session.invalidated';
  sessionId: string;
  roomId: string;
  roomNumber: string;
  reason: 'checked_out' | 'expired' | 'manual_revocation';
}
