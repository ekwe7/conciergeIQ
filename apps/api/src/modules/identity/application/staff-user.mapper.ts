import type { StaffUser } from '@conciergeiq/contracts';
import type { UserRow } from '../infrastructure/identity.schema.js';

export function toStaffUser(user: UserRow): StaffUser {
  return {
    id: user.id,
    hotelId: user.hotelId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    lastSignedInAt: user.lastSignedInAt?.toISOString() ?? null,
  };
}
