import { z } from 'zod';
import { OrderStatus } from '../order-status.js';
import type { PaymentMethod } from '../payment-method.js';

export const OrderItemInputSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive().max(50),
  notes: z.string().max(255).optional(),
});
export type OrderItemInput = z.infer<typeof OrderItemInputSchema>;

export const CreateOrderSchema = z.object({
  items: z.array(OrderItemInputSchema).min(1, 'Order must contain at least one item'),
  deliveryNotes: z.string().max(500).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

/** Accept (`IN_PROGRESS`), deliver (`DELIVERED`) or cancel (`CANCELLED`, reason required). */
export const UpdateOrderStatusSchema = z
  .object({
    status: z.enum([OrderStatus.IN_PROGRESS, OrderStatus.DELIVERED, OrderStatus.CANCELLED]),
    reason: z.string().trim().max(255).optional(),
  })
  .refine((input) => input.status !== OrderStatus.CANCELLED || Boolean(input.reason), {
    message: 'A reason is required to cancel an order',
    path: ['reason'],
  });
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

export const ListOrdersQuerySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  /** Only orders placed at or after this time. Defaults to the last 24 hours. */
  since: z.string().datetime({ offset: true }).optional(),
});

export interface OrderStatusChange {
  from: OrderStatus | null;
  to: OrderStatus;
  changedBy: string;
  changedAt: string;
}

export interface OrderResponse {
  id: string;
  number: number;
  roomId: string;
  roomNumber: string;
  stayId: string;
  status: OrderStatus;
  items: { itemId: string; name: string; quantity: number; unitPrice: number; notes?: string }[];
  totalAmount: number;
  cancelReason: string | null;
  payment: { method: PaymentMethod; paidAt: string } | null;
  history: OrderStatusChange[];
  createdAt: string;
  updatedAt: string;
}
