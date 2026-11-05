import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LiveDashboard } from '../support/live-dashboard.js';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

describe('Missed-order alerts', () => {
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

  const ladder = {
    manager: { enabled: true, afterSeconds: 120, channel: 'WHATSAPP', recipientName: 'Kemi Idowu', phone: '0803 123 4412' },
    admin: { enabled: true, afterSeconds: 300, channel: 'SMS', recipientName: 'Emmanuel Ekwe', phone: '+234 802 555 9017' },
  };

  const turnOnAlerts = async () => {
    const response = await hotel.admin.put('/escalations/rules', ladder);
    expect(response.status).toBe(200);
    return response.body;
  };

  it('texts the manager at 2 minutes and the admin at 5, once each', async () => {
    await turnOnAlerts();
    const { order } = await hotel.pendingOrder('318');

    world.clock.advanceSeconds(119);
    expect(await world.checkForMissedOrders()).toBe(0);

    world.clock.advanceSeconds(1);
    expect(await world.checkForMissedOrders()).toBe(1);
    expect(world.notifier.sent).toEqual([
      expect.objectContaining({ to: '+2348031234412', channel: 'WHATSAPP' }),
    ]);
    expect(world.notifier.sent[0].text).toBe(
      `Azure Bay Hotel: Room 318 order A-${order.number} (Jollof rice 318 ×2) has waited 2 min without being accepted. ` +
        `http://localhost:5174/orders?order=${order.id}`,
    );

    world.clock.advanceSeconds(60);
    expect(await world.checkForMissedOrders()).toBe(0);

    world.clock.advanceSeconds(120);
    expect(await world.checkForMissedOrders()).toBe(1);
    expect(world.notifier.sent[1]).toEqual(expect.objectContaining({ to: '+2348025559017', channel: 'SMS' }));
    expect(world.notifier.sent[1].text).toContain('has waited 5 min without being accepted. The manager was already alerted.');

    world.clock.advanceMinutes(10);
    expect(await world.checkForMissedOrders()).toBe(0);
    expect(world.notifier.sent).toHaveLength(2);
  });

  it('does nothing once someone accepts the order', async () => {
    await turnOnAlerts();
    const { order } = await hotel.pendingOrder();
    world.clock.advanceSeconds(90);
    await hotel.staff.patch(`/orders/${order.id}/status`, { status: 'IN_PROGRESS' });

    world.clock.advanceMinutes(10);
    expect(await world.checkForMissedOrders()).toBe(0);
    expect(world.notifier.sent).toEqual([]);
  });

  it('sends nothing until an admin turns alerts on', async () => {
    await hotel.pendingOrder();
    world.clock.advanceMinutes(10);
    expect(await world.checkForMissedOrders()).toBe(0);

    const { body: rules } = await hotel.admin.get('/escalations/rules');
    expect(rules).toEqual(
      expect.objectContaining({
        manager: expect.objectContaining({ enabled: false, afterSeconds: 120 }),
        admin: expect.objectContaining({ enabled: false, afterSeconds: 300 }),
        updatedAt: null,
      }),
    );
  });

  it('never texts twice, even if two checks run at the same time', async () => {
    await turnOnAlerts();
    await hotel.pendingOrder();
    world.clock.advanceSeconds(150);

    const results = await Promise.all([world.checkForMissedOrders(), world.app.modules.escalations.escalations.sweep()]);

    expect(results.reduce((sum, sent) => sum + sent, 0)).toBe(1);
    expect(world.notifier.sent).toHaveLength(1);
  });

  it('records a failed send and does not retry it every few seconds', async () => {
    await turnOnAlerts();
    await hotel.pendingOrder('214');
    world.notifier.failWith = 'Termii refused the message (400): Insufficient balance';
    world.clock.advanceSeconds(130);

    expect(await world.checkForMissedOrders()).toBe(0);
    world.notifier.failWith = null;
    expect(await world.checkForMissedOrders()).toBe(0);

    const { body: history } = await hotel.manager.get('/escalations/alerts');
    expect(history).toEqual([
      expect.objectContaining({
        roomNumber: '214',
        level: 1,
        status: 'FAILED',
        error: 'Termii refused the message (400): Insufficient balance',
      }),
    ]);
  });

  it('shows the history with how long each order waited for acceptance', async () => {
    await turnOnAlerts();
    const { order } = await hotel.pendingOrder('104');
    world.clock.advanceSeconds(130);
    await world.checkForMissedOrders();
    world.clock.advanceSeconds(32);
    await hotel.staff.patch(`/orders/${order.id}/status`, { status: 'IN_PROGRESS' });

    const { body: history } = await hotel.manager.get('/escalations/alerts', { days: '7' });

    expect(history).toEqual([
      expect.objectContaining({
        orderId: order.id,
        orderNumber: order.number,
        level: 1,
        recipientName: 'Kemi Idowu',
        channel: 'WHATSAPP',
        status: 'SENT',
        acceptedAfterSeconds: 162,
        orderStatus: 'IN_PROGRESS',
      }),
    ]);
    expect(history[0]).not.toHaveProperty('phone');
  });

  it('tells signed-in staff and the activity log', async () => {
    await turnOnAlerts();
    const dashboard = await LiveDashboard.open(world.server, hotel.staff.accessToken);
    const { order } = await hotel.pendingOrder('207');
    await world.deliverEvents();
    world.clock.advanceSeconds(125);
    await world.checkForMissedOrders();
    await world.deliverEvents();

    await dashboard.waitFor(() => dashboard.messagesOfType('ORDER_ESCALATED').length > 0);
    expect(dashboard.messagesOfType('ORDER_ESCALATED')[0]).toEqual({
      type: 'ORDER_ESCALATED',
      payload: { orderId: order.id, orderNumber: order.number, roomNumber: '207', level: 1, recipientName: 'Kemi Idowu', waitedSeconds: 125 },
    });
    dashboard.close();

    const { body: activity } = await hotel.manager.get('/activity', { category: 'orders' });
    expect(activity.map((entry: { detail: string }) => entry.detail)).toContain(
      `A-${order.number} · Room 207 · waited 2 min · manager Kemi Idowu alerted`,
    );
  });

  it('sends a test alert to the saved number', async () => {
    await turnOnAlerts();

    const { status, body } = await hotel.admin.post('/escalations/test', { level: 'admin' });

    expect(status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ status: 'SENT', error: null }));
    expect(world.notifier.sent).toEqual([expect.objectContaining({ to: '+2348025559017', channel: 'SMS' })]);
    expect(world.notifier.sent[0].text).toContain('will text Emmanuel Ekwe here when an order waits 5 min');
  });

  it('checks the rules before saving', async () => {
    const badPhone = await hotel.admin.put('/escalations/rules', { ...ladder, manager: { ...ladder.manager, phone: '12' } });
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.error.message).toContain('manager phone number is not valid');

    const noName = await hotel.admin.put('/escalations/rules', { ...ladder, admin: { ...ladder.admin, recipientName: '' } });
    expect(noName.status).toBe(400);

    const wrongOrder = await hotel.admin.put('/escalations/rules', { ...ladder, admin: { ...ladder.admin, afterSeconds: 60 } });
    expect(wrongOrder.status).toBe(400);

    const saved = await turnOnAlerts();
    expect(saved.manager.phone).toBe('+2348031234412');
  });

  it('keeps phone numbers to admins and alerts to each hotel', async () => {
    await turnOnAlerts();
    expect((await hotel.manager.get('/escalations/rules')).status).toBe(403);
    expect((await hotel.manager.put('/escalations/rules', ladder)).status).toBe(403);
    expect((await hotel.receptionist.get('/escalations/alerts')).status).toBe(403);

    await hotel.pendingOrder();
    world.clock.advanceSeconds(130);
    await world.checkForMissedOrders();

    const otherHotel = await world.createHotel('Other Hotel');
    expect((await otherHotel.admin.get('/escalations/alerts')).body).toEqual([]);
    expect((await otherHotel.admin.get('/escalations/rules')).body.updatedAt).toBeNull();
  });
});
