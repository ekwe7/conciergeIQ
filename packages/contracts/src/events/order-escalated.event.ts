import type { EscalationChannel, EscalationLevel } from '../api/escalations.schemas.js';
import type { EventBase } from './event-base.js';

/** An order waited too long without being accepted, and someone was texted about it. */
export interface OrderEscalatedEvent extends EventBase {
  eventName: 'order.escalated';
  orderId: string;
  orderNumber: number;
  roomNumber: string;
  level: EscalationLevel;
  channel: EscalationChannel;
  recipientName: string;
  waitedSeconds: number;
  delivered: boolean;
}
