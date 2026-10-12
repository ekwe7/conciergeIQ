import { z } from 'zod';
import { OrderStatus } from '../order-status.js';

export const OrderItemInputSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  notes: z.string().max(255).optional(),
});
export type OrderItemInput = z.infer<typeof OrderItemInputSchema>;

export const CreateOrderSchema = z.object({
  items: z.array(OrderItemInputSchema).min(1, 'Order must contain at least one item'),
  deliveryNotes: z.string().max(500).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export const UpdateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  reason: z.string().max(255).optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

export const OrderResponseSchema = z.object({
  id: z.string().uuid(),
  hotelId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  status: z.nativeEnum(OrderStatus),
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      name: z.string(),
      quantity: z.number().int(),
      unitPrice: z.number(),
      notes: z.string().optional(),
    })
  ),
  totalAmount: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OrderResponse = z.infer<typeof OrderResponseSchema>;
