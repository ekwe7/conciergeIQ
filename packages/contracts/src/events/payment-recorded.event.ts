import type { PaymentMethod } from '../payment-method.js';
import type { EventBase } from './event-base.js';

export interface PaymentRecordedEvent extends EventBase {
  eventName: 'payment.recorded';
  paymentId: string;
  orderId: string;
  orderNumber: number;
  amount: number;
  method: PaymentMethod;
}
