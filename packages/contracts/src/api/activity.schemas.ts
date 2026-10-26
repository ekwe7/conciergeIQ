import { z } from 'zod';

export const ActivityCategory = {
  ORDERS: 'orders',
  PAYMENTS: 'payments',
  STAYS: 'stays',
  MENU: 'menu',
  STAFF: 'staff',
  ROOMS: 'rooms',
} as const;
export type ActivityCategory = (typeof ActivityCategory)[keyof typeof ActivityCategory];

export const ListActivityQuerySchema = z.object({
  category: z.nativeEnum(ActivityCategory).optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListActivityQuery = z.infer<typeof ListActivityQuerySchema>;

export interface ActivityEntry {
  id: string;
  eventName: string;
  category: ActivityCategory;
  detail: string;
  actorName: string;
  occurredAt: string;
}
