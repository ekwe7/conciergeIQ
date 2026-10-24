import { z } from 'zod';

export const UpdateHotelSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(255),
    timezone: z.string().trim().min(1).max(50),
    currency: z.string().trim().length(3).toUpperCase(),
  })
  .partial();
export type UpdateHotelInput = z.infer<typeof UpdateHotelSchema>;

export interface Hotel {
  id: string;
  name: string;
  address: string;
  timezone: string;
  currency: string;
}
