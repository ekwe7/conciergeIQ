import type { EventBase } from './event-base.js';

export interface UserDeactivatedEvent extends EventBase {
  eventName: 'user.deactivated';
  userId: string;
  userName: string;
}
