import type { EventBase } from './event-base.js';

export interface StayCheckedInEvent extends EventBase {
  eventName: 'stay.checked_in';
  stayId: string;
  roomId: string;
  roomNumber: string;
  guestName: string;
  expectedCheckOutAt: string;
}
