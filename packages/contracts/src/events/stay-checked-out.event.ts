import type { EventBase } from './event-base.js';

export interface StayCheckedOutEvent extends EventBase {
  eventName: 'stay.checked_out';
  stayId: string;
  roomId: string;
  roomNumber: string;
  guestName: string;
}
