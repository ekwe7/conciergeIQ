import { z } from 'zod';
import { StaffRole } from '../staff-role.js';

export const StaffLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type StaffLoginInput = z.infer<typeof StaffLoginSchema>;

export const RefreshSessionSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshSessionInput = z.infer<typeof RefreshSessionSchema>;

export interface StaffUser {
  id: string;
  hotelId: string;
  email: string;
  fullName: string;
  role: StaffRole;
  isActive: boolean;
  lastSignedInAt: string | null;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: StaffUser;
}
