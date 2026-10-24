import { z } from 'zod';
import { PaymentMethod } from '../payment-method.js';

export const RecordPaymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  /** Card terminal slip or bank transfer reference, if there is one. */
  reference: z.string().trim().max(64).optional(),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;

export const PaymentsPeriodQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: number;
  roomNumber: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface PaymentsSummary {
  collected: { total: number; count: number };
  byMethod: Record<PaymentMethod, number>;
  outstanding: { total: number; count: number };
}
