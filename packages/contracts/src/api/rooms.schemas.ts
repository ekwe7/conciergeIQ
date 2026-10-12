import { z } from 'zod';

export const RoomSchema = z.object({
  id: z.string().uuid(),
  hotelId: z.string().uuid(),
  roomNumber: z.string().min(1),
  floor: z.number().int().optional(),
  type: z.enum(['standard', 'deluxe', 'suite', 'penthouse']),
  status: z.enum(['vacant', 'occupied', 'cleaning', 'maintenance']),
});
export type Room = z.infer<typeof RoomSchema>;

export const GenerateRoomQRSchema = z.object({
  roomId: z.string().uuid(),
  expiresInSeconds: z.number().int().positive().default(86400 * 7), // 7 days default
});
export type GenerateRoomQRInput = z.infer<typeof GenerateRoomQRSchema>;

export const RoomQRResponseSchema = z.object({
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  qrToken: z.string(),
  qrCodeUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type RoomQRResponse = z.infer<typeof RoomQRResponseSchema>;
