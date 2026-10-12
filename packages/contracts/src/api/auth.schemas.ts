import { z } from 'zod';

export const StaffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type StaffLoginInput = z.infer<typeof StaffLoginSchema>;

export const StaffUserSchema = z.object({
  id: z.string().uuid(),
  hotelId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['staff', 'manager', 'admin', 'superadmin']),
  isActive: z.boolean(),
});
export type StaffUser = z.infer<typeof StaffUserSchema>;

export const AuthTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  user: StaffUserSchema,
  expiresIn: z.number().int(),
});
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;
