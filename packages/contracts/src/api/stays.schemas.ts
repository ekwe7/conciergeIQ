import { z } from 'zod';

export const CheckInSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  expectedCheckOutAt: z.string().datetime({ offset: true }),
  guestPhone: z.string().trim().max(30).optional(),
});
export type CheckInInput = z.infer<typeof CheckInSchema>;

export interface Stay {
  id: string;
  roomId: string;
  roomNumber: string;
  guestName: string;
  guestPhone: string | null;
  checkedInAt: string;
  expectedCheckOutAt: string;
  checkedOutAt: string | null;
}

/** What the check-out dialog shows before the receptionist confirms. */
export interface StayBill {
  stayId: string;
  ordersCount: number;
  totalCharged: number;
  totalPaid: number;
  outstanding: number;
  openOrders: { orderId: string; orderNumber: number; status: string; itemsSummary: string }[];
}
