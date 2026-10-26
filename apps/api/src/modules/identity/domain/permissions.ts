import { STAFF_ROLES_IN_ORDER, StaffRole } from '@conciergeiq/contracts';

/** Everything a signed-in staff member can be allowed to do. */
export const Permission = {
  VIEW_AND_UPDATE_ORDERS: 'VIEW_AND_UPDATE_ORDERS',
  VIEW_MENU: 'VIEW_MENU',
  MARK_ITEMS_UNAVAILABLE: 'MARK_ITEMS_UNAVAILABLE',
  RECORD_PAYMENTS: 'RECORD_PAYMENTS',
  CHECK_GUESTS_IN_AND_OUT: 'CHECK_GUESTS_IN_AND_OUT',
  VIEW_ROOMS: 'VIEW_ROOMS',
  EDIT_MENU: 'EDIT_MENU',
  MANAGE_STAFF: 'MANAGE_STAFF',
  VIEW_ACTIVITY_LOG: 'VIEW_ACTIVITY_LOG',
  MANAGE_ROOMS_AND_QR_CODES: 'MANAGE_ROOMS_AND_QR_CODES',
  MANAGE_HOTEL_SETTINGS: 'MANAGE_HOTEL_SETTINGS',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/** The least powerful role that has each permission. Roles above it have it too. */
const MINIMUM_ROLE: Record<Permission, StaffRole> = {
  VIEW_AND_UPDATE_ORDERS: StaffRole.STAFF,
  VIEW_MENU: StaffRole.STAFF,
  MARK_ITEMS_UNAVAILABLE: StaffRole.RECEPTIONIST,
  RECORD_PAYMENTS: StaffRole.RECEPTIONIST,
  CHECK_GUESTS_IN_AND_OUT: StaffRole.RECEPTIONIST,
  VIEW_ROOMS: StaffRole.RECEPTIONIST,
  EDIT_MENU: StaffRole.MANAGER,
  MANAGE_STAFF: StaffRole.MANAGER,
  VIEW_ACTIVITY_LOG: StaffRole.MANAGER,
  MANAGE_ROOMS_AND_QR_CODES: StaffRole.ADMIN,
  MANAGE_HOTEL_SETTINGS: StaffRole.ADMIN,
};

function rank(role: StaffRole): number {
  return STAFF_ROLES_IN_ORDER.indexOf(role);
}

export function roleCan(role: StaffRole, permission: Permission): boolean {
  return rank(role) >= rank(MINIMUM_ROLE[permission]);
}

/**
 * Admins manage everyone. Managers manage only the roles below them, so they
 * cannot create, promote or deactivate another manager or an admin.
 */
export function canManageRole(actorRole: StaffRole, targetRole: StaffRole): boolean {
  if (actorRole === StaffRole.ADMIN) return true;
  return roleCan(actorRole, Permission.MANAGE_STAFF) && rank(targetRole) < rank(actorRole);
}
