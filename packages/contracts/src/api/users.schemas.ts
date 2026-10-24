import { z } from 'zod';
import { StaffRole } from '../staff-role.js';

export const CreateStaffUserSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  role: z.nativeEnum(StaffRole),
  /** Temporary password the person changes after their first sign-in. */
  password: z.string().min(8).max(128),
});
export type CreateStaffUserInput = z.infer<typeof CreateStaffUserSchema>;

export const UpdateStaffUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    role: z.nativeEnum(StaffRole),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateStaffUserInput = z.infer<typeof UpdateStaffUserSchema>;
