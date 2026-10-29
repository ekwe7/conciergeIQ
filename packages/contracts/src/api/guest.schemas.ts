import { z } from 'zod';

export const ResolveGuestSessionSchema = z.object({
  qrToken: z.string().min(1, 'QR token is required'),
});
export type ResolveGuestSessionInput = z.infer<typeof ResolveGuestSessionSchema>;

export const GuestSessionResponseSchema = z.object({
  token: z.string().optional(),
  sessionId: z.string().uuid(),
  hotelId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  guestName: z.string().optional(),
  stayId: z.string().uuid().optional(),
  expiresAt: z.string().datetime(),
});
export type GuestSessionResponse = z.infer<typeof GuestSessionResponseSchema>;

export const GuestServiceRequestCreateSchema = z.object({
  category: z.enum(['housekeeping', 'room_service', 'concierge', 'maintenance']),
  details: z.string().min(1).max(1000),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});
export type GuestServiceRequestCreateInput = z.infer<typeof GuestServiceRequestCreateSchema>;
