import { z } from 'zod';

const roomNumber = z.string().trim().min(1).max(10);
const floor = z.number().int().min(0).max(200);

export const CreateRoomSchema = z.object({ number: roomNumber, floor });
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const CreateRoomsInBulkSchema = z.object({
  rooms: z.array(CreateRoomSchema).min(1).max(500),
});
export type CreateRoomsInBulkInput = z.infer<typeof CreateRoomsInBulkSchema>;

export const UpdateRoomSchema = z
  .object({
    number: roomNumber,
    floor,
    isOutOfOrder: z.boolean(),
    outOfOrderReason: z.string().trim().max(120).nullable(),
  })
  .partial();
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;

export const RegenerateQrCodesSchema = z.object({
  roomIds: z.array(z.string().uuid()).min(1).max(500),
});
export type RegenerateQrCodesInput = z.infer<typeof RegenerateQrCodesSchema>;

export const ListRoomsQuerySchema = z.object({
  floor: z.coerce.number().int().optional(),
});

export interface Room {
  id: string;
  number: string;
  floor: number;
  isOutOfOrder: boolean;
  outOfOrderReason: string | null;
  qrToken: string;
  /** What the printed QR code opens: `<guest app>/r/<qrToken>`. */
  qrUrl: string;
  qrRegeneratedAt: string | null;
}
