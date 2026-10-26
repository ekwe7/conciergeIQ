import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { StaffClient } from '../support/staff-client.js';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

describe('Roles and staff accounts', () => {
  let world: TestWorld;
  let hotel: HotelFixture;

  beforeAll(async () => {
    world = await TestWorld.start();
  });
  afterAll(() => world.stop());
  beforeEach(async () => {
    await world.reset();
    hotel = await world.createHotel();
  });

  describe('roles are cumulative and checked on the server', () => {
    // The "Permissions" table on the Staff & roles screen, as requests.
    const screens: { action: string; call: (as: StaffClient) => Promise<{ status: number }>; minimumRole: string }[] = [
      { action: 'view the live orders board', call: (as) => as.get('/orders'), minimumRole: 'staff' },
      { action: 'see check-ins and stays', call: (as) => as.get('/stays'), minimumRole: 'receptionist' },
      { action: 'see payments', call: (as) => as.get('/payments'), minimumRole: 'receptionist' },
      { action: 'manage staff accounts', call: (as) => as.get('/users'), minimumRole: 'manager' },
      { action: 'read the activity log', call: (as) => as.get('/activity'), minimumRole: 'manager' },
      { action: 'add rooms', call: (as) => as.post('/rooms', { number: '999', floor: 9 }), minimumRole: 'admin' },
    ];
    const rolesInOrder = ['staff', 'receptionist', 'manager', 'admin'] as const;

    for (const { action, call, minimumRole } of screens) {
      for (const role of rolesInOrder) {
        const allowed = rolesInOrder.indexOf(role) >= rolesInOrder.indexOf(minimumRole as (typeof rolesInOrder)[number]);

        it(`${allowed ? 'lets' : 'does not let'} a ${role} ${action}`, async () => {
          const response = await call(hotel[role]);

          if (allowed) expect(response.status).not.toBe(403);
          else expect(response.status).toBe(403);
        });
      }
    }
  });

  describe('a manager', () => {
    it('can invite staff and receptionists', async () => {
      const response = await hotel.manager.post('/users', {
        fullName: 'Fatima Abubakar',
        email: 'fatima@hotel1.test',
        role: 'STAFF',
        password: 'Welcome123!',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ fullName: 'Fatima Abubakar', role: 'STAFF', isActive: true });
    });

    it('cannot create another manager or an admin', async () => {
      const response = await hotel.manager.post('/users', {
        fullName: 'New Boss',
        email: 'boss@hotel1.test',
        role: 'ADMIN',
        password: 'Welcome123!',
      });

      expect(response.status).toBe(403);
    });

    it('cannot promote a receptionist to manager', async () => {
      const response = await hotel.manager.patch(`/users/${hotel.receptionist.user.id}`, { role: 'MANAGER' });

      expect(response.status).toBe(403);
    });

    it('cannot deactivate the admin', async () => {
      const response = await hotel.manager.patch(`/users/${hotel.admin.user.id}`, { isActive: false });

      expect(response.status).toBe(403);
    });
  });

  describe('an admin', () => {
    it('can promote anyone and deactivate accounts', async () => {
      const promoted = await hotel.admin.patch(`/users/${hotel.receptionist.user.id}`, { role: 'MANAGER' });
      const deactivated = await hotel.admin.patch(`/users/${hotel.staff.user.id}`, { isActive: false });

      expect(promoted.body.role).toBe('MANAGER');
      expect(deactivated.body.isActive).toBe(false);
    });

    it('cannot lock themselves out', async () => {
      const response = await hotel.admin.patch(`/users/${hotel.admin.user.id}`, { isActive: false });

      expect(response.status).toBe(403);
    });

    it('cannot reuse an email that already has an account', async () => {
      const response = await hotel.admin.post('/users', {
        fullName: 'Duplicate',
        email: hotel.staff.user.email,
        role: 'STAFF',
        password: 'Welcome123!',
      });

      expect(response.status).toBe(409);
    });
  });

  it('lists the whole team, including deactivated accounts', async () => {
    await hotel.admin.patch(`/users/${hotel.staff.user.id}`, { isActive: false });

    const { body: team } = await hotel.manager.get('/users');

    expect(team).toHaveLength(4);
    expect(team.find((member: { id: string }) => member.id === hotel.staff.user.id).isActive).toBe(false);
  });
});
