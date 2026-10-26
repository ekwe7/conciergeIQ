import { StaffRole } from '@conciergeiq/contracts';
import { describe, expect, it } from 'vitest';
import { Permission, canManageRole, roleCan } from '../domain/permissions.js';

const { STAFF, RECEPTIONIST, MANAGER, ADMIN } = StaffRole;

describe('Permissions', () => {
  // The permissions table from the "Staff & roles" screen.
  const table: [Permission, StaffRole[]][] = [
    [Permission.VIEW_AND_UPDATE_ORDERS, [STAFF, RECEPTIONIST, MANAGER, ADMIN]],
    [Permission.MARK_ITEMS_UNAVAILABLE, [RECEPTIONIST, MANAGER, ADMIN]],
    [Permission.RECORD_PAYMENTS, [RECEPTIONIST, MANAGER, ADMIN]],
    [Permission.CHECK_GUESTS_IN_AND_OUT, [RECEPTIONIST, MANAGER, ADMIN]],
    [Permission.EDIT_MENU, [MANAGER, ADMIN]],
    [Permission.MANAGE_STAFF, [MANAGER, ADMIN]],
    [Permission.MANAGE_ROOMS_AND_QR_CODES, [ADMIN]],
  ];

  for (const [permission, allowedRoles] of table) {
    it(`${permission} is allowed for ${allowedRoles.join(', ')} only`, () => {
      for (const role of [STAFF, RECEPTIONIST, MANAGER, ADMIN]) {
        expect(roleCan(role, permission)).toBe(allowedRoles.includes(role));
      }
    });
  }

  describe('who can manage whom', () => {
    it('lets a manager manage only the roles below manager', () => {
      expect(canManageRole(MANAGER, STAFF)).toBe(true);
      expect(canManageRole(MANAGER, RECEPTIONIST)).toBe(true);
      expect(canManageRole(MANAGER, MANAGER)).toBe(false);
      expect(canManageRole(MANAGER, ADMIN)).toBe(false);
    });

    it('lets an admin manage everyone', () => {
      expect([STAFF, RECEPTIONIST, MANAGER, ADMIN].every((role) => canManageRole(ADMIN, role))).toBe(true);
    });

    it('lets nobody below manager manage anyone', () => {
      expect(canManageRole(RECEPTIONIST, STAFF)).toBe(false);
      expect(canManageRole(STAFF, STAFF)).toBe(false);
    });
  });
});
