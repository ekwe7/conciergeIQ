import type { Room, Stay } from '@conciergeiq/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LiveDashboard } from '../support/live-dashboard.js';
import type { ApiResponse, StaffClient } from '../support/staff-client.js';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

/**
 * Two hotels share one system. Nothing one hotel's staff can call, even as
 * an admin, may show or change the other hotel's data.
 */
describe('Tenant isolation', () => {
  let world: TestWorld;
  let azure: HotelFixture;
  let coral: HotelFixture;
  let coralAdmin: StaffClient;

  // Azure Bay's data, which Coral Reef must never reach.
  let azureRoom: Room;
  let azureStay: Stay;
  let azureOrderId: string;
  let azureDeliveredOrderId: string;
  let azureMenuItemId: string;
  let azureCategoryId: string;

  beforeAll(async () => {
    world = await TestWorld.start();
    await world.reset();
    azure = await world.createHotel('Azure Bay Hotel');
    coral = await world.createHotel('Coral Reef Hotel');
    coralAdmin = coral.admin;

    const pending = await azure.pendingOrder('101');
    azureRoom = pending.room;
    azureStay = pending.stay;
    azureOrderId = pending.order.id;

    const delivered = await azure.pendingOrder('102');
    azureDeliveredOrderId = delivered.order.id;
    await azure.acceptAndDeliver(azureDeliveredOrderId);
    await azure.receptionist.post(`/orders/${azureDeliveredOrderId}/payments`, { method: 'CARD' });

    const menuItem = await azure.addMenuItem('Azure club burger', 9200);
    azureMenuItemId = menuItem.id;
    azureCategoryId = menuItem.categoryId;

    await coral.pendingOrder('101');
    await world.deliverEvents();
  });
  afterAll(() => world.stop());

  /** Every id Azure Bay owns, to search Coral Reef's responses for. */
  const azureIds = () => [
    azure.id,
    azureRoom.id,
    azureStay.id,
    azureOrderId,
    azureDeliveredOrderId,
    azureMenuItemId,
    azureCategoryId,
    azure.admin.user.id,
    azure.staff.user.id,
  ];

  describe("lists only ever contain the caller's own hotel", () => {
    const lists = [
      '/hotel',
      '/rooms',
      '/stays',
      '/menu',
      '/orders',
      '/payments',
      '/payments/summary',
      '/payments/outstanding',
      '/users',
      '/activity',
    ];

    for (const path of lists) {
      it(`GET ${path}`, async () => {
        const response = await coralAdmin.get(path);

        expect(response.status).toBe(200);
        const body = JSON.stringify(response.body);
        for (const id of azureIds()) expect(body).not.toContain(id);
      });
    }

    it('the hotel endpoint returns Coral Reef itself', async () => {
      expect((await coralAdmin.get('/hotel')).body.name).toBe('Coral Reef Hotel');
    });

    it("Coral Reef's own data is there, so the lists are not just empty", async () => {
      expect((await coralAdmin.get('/orders')).body).toHaveLength(1);
      expect((await coralAdmin.get('/rooms')).body).toHaveLength(1);
    });
  });

  describe("another hotel's records look like they do not exist", () => {
    const attempts: [string, (as: StaffClient) => Promise<ApiResponse>][] = [
      ['open an order', (as) => as.get(`/orders/${azureOrderId}`)],
      ['accept an order', (as) => as.patch(`/orders/${azureOrderId}/status`, { status: 'IN_PROGRESS' })],
      ['cancel an order', (as) => as.patch(`/orders/${azureOrderId}/status`, { status: 'CANCELLED', reason: 'x' })],
      ['record a payment', (as) => as.post(`/orders/${azureDeliveredOrderId}/payments`, { method: 'CASH' })],
      ['open a stay', (as) => as.get(`/stays/${azureStay.id}`)],
      ['read a bill', (as) => as.get(`/stays/${azureStay.id}/bill`)],
      ['check a guest out', (as) => as.post(`/stays/${azureStay.id}/check-out`)],
      [
        'check a guest in',
        (as) => as.post(`/rooms/${azureRoom.id}/check-in`, { guestName: 'x', expectedCheckOutAt: world.clock.daysFromNow(1) }),
      ],
      ['rename a room', (as) => as.patch(`/rooms/${azureRoom.id}`, { number: '999' })],
      ['regenerate a QR code', (as) => as.post(`/rooms/${azureRoom.id}/qr/regenerate`)],
      ['regenerate selected QR codes', (as) => as.post('/rooms/qr/regenerate', { roomIds: [azureRoom.id] })],
      ['change a price', (as) => as.patch(`/menu/items/${azureMenuItemId}`, { price: 1 })],
      ['mark an item unavailable', (as) => as.patch(`/menu/items/${azureMenuItemId}/availability`, { isAvailable: false })],
      ['delete a menu item', (as) => as.delete(`/menu/items/${azureMenuItemId}`)],
      ['rename a category', (as) => as.patch(`/menu/categories/${azureCategoryId}`, { name: 'x' })],
      [
        'add an item to a category',
        (as) => as.post('/menu/items', { categoryId: azureCategoryId, name: 'x', price: 1 }),
      ],
      ['deactivate a staff member', (as) => as.patch(`/users/${azure.staff.user.id}`, { isActive: false })],
    ];

    for (const [action, attempt] of attempts) {
      it(`cannot ${action}`, async () => {
        const response = await attempt(coralAdmin);

        expect(response.status).toBe(404);
      });
    }

    it("left all of Azure Bay's data untouched", async () => {
      expect((await azure.staff.get(`/orders/${azureOrderId}`)).body.status).toBe('PENDING');
      expect((await azure.receptionist.get(`/stays/${azureStay.id}`)).body.checkedOutAt).toBeNull();
      expect((await azure.receptionist.get('/rooms')).body.map((room: Room) => room.number)).toEqual(['101', '102']);
      expect((await azure.manager.get('/users')).body.every((user: { isActive: boolean }) => user.isActive)).toBe(true);
    });
  });

  it('prints QR codes only for the hotel the admin works at', async () => {
    const response = await world.server.inject({
      method: 'GET',
      url: '/api/v1/rooms/qr.pdf',
      headers: { authorization: `Bearer ${coralAdmin.accessToken}` },
    });

    expect(response.rawPayload.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it("never pushes another hotel's orders to a live dashboard", async () => {
    const coralDashboard = await LiveDashboard.open(world.server, coral.staff.accessToken);
    const azureDashboard = await LiveDashboard.open(world.server, azure.staff.accessToken);

    const newRoom = await azure.addRoom('305');
    const stay = await azure.checkIn(newRoom);
    const water = await azure.addMenuItem('Water', 500, 'Drinks');
    await azure.guestOrders(stay, [{ item: water }]);
    await world.deliverEvents();
    await azureDashboard.waitFor(() => azureDashboard.messagesOfType('NEW_ORDER_RECEIVED').length > 0);

    expect(coralDashboard.messagesOfType('NEW_ORDER_RECEIVED')).toEqual([]);
    coralDashboard.close();
    azureDashboard.close();
  });
});
