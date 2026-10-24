/**
 * Staff roles, from least to most powerful. Roles are cumulative: each role
 * can do everything the roles before it can.
 */
export const StaffRole = {
  STAFF: 'STAFF',
  RECEPTIONIST: 'RECEPTIONIST',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
} as const;

export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

export const STAFF_ROLES_IN_ORDER: readonly StaffRole[] = [
  StaffRole.STAFF,
  StaffRole.RECEPTIONIST,
  StaffRole.MANAGER,
  StaffRole.ADMIN,
];
