/**
 * WHAT IT DOES:
 * Authoritative end-to-end integration test suite validating the entire guest-to-staff
 * ordering and fulfillment lifecycle across all system components:
 * 1. Database seeding (hotel, staff, rooms, menu catalog, active stay).
 * 2. Room QR token resolution into an authenticated guest session.
 * 3. Menu browsing with category grouping and real-time availability.
 * 4. Concurrent WebSocket connections (staff live dashboard and guest mobile session).
 * 5. Guest order submission with transactional outbox event commitment.
 * 6. Live staff order board notification (NEW_ORDER_RECEIVED).
 * 7. Staff order progression (PENDING -> IN_PROGRESS -> DELIVERED).
 * 8. Real-time guest order status pushes (ORDER_STATUS_UPDATED).
 * 9. Order tracking queries and folio billing reconciliation.
 * 10. Check-out session revocation, WebSocket termination, and QR invalidation.
 * 11. Reconnection recovery with Last-Event-ID replay.
 * 12. Idempotent order placement deduplication.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Proves that Stage 1 delivers an unbroken guest-to-staff ordering experience.
 * - Operates deterministically without arbitrary setTimeout sleeps, using promise-based
 *   event waiters and outbox dispatchers.
 */

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MenuItem, Room, Stay } from '@conciergeiq/contracts';
import { orders } from '../../src/modules/ordering/infrastructure/orders.schema.js';
import { outboxEvents } from '../../src/shared/events/outbox.schema.js';
import { TestWorld, type HotelFixture } from '../support/test-world.js';
import { callAnonymously } from '../support/staff-client.js';
import { LiveDashboard } from '../support/live-dashboard.js';
import { LiveGuestSession } from '../support/live-guest.js';
import { GuestClient } from '../support/guest-client.js';

describe('End-to-End Guest-to-Staff Core Loop Verification Gate', () => {
  let world: TestWorld;
  let hotel: HotelFixture;
  let room: Room;
  let stay: Stay;
  let suyaItem: MenuItem;
  let chapmanItem: MenuItem;
  let puffPuffItem: MenuItem;

  beforeAll(async () => {
    world = await TestWorld.start();
  });

  afterAll(async () => {
    await world.stop();
  });

  beforeEach(async () => {
    await world.reset();

    // 1. Seed hotel with administrative, management, receptionist, and staff roles
    hotel = await world.createHotel('Eko Atlantic Palace');

    // 2. Seed verified room
    room = await hotel.addRoom('505', 5);

    // 3. Seed menu catalog across distinct categories
    suyaItem = await hotel.addMenuItem('Grilled Beef Suya', 7_500, 'Mains');
    chapmanItem = await hotel.addMenuItem('Signature Chapman', 2_500, 'Beverages');
    puffPuffItem = await hotel.addMenuItem('Spiced Puff Puff', 3_000, 'Desserts');

    // 4. Seed active check-in stay for the room
    stay = await hotel.checkIn(room, 'Dr. Ngozi Okonjo');
  });

  it('executes the unbroken guest-to-staff ordering loop from QR scan to check-out revocation', async () => {
    // -------------------------------------------------------------------------
    // STEP 1: Scan and resolve Room QR Token
    // -------------------------------------------------------------------------
    expect(room.qrToken).toBeDefined();
    expect(room.qrToken).toHaveLength(32);

    const resolveSessionResponse = await callAnonymously(
      world.server,
      'POST',
      '/guest/sessions',
      { qrToken: room.qrToken }
    );

    expect(resolveSessionResponse.status).toBe(201);
    const sessionData = resolveSessionResponse.body;
    expect(sessionData.token).toBeDefined();
    expect(sessionData.sessionId).toBeDefined();
    expect(sessionData.hotelId).toBe(hotel.id);
    expect(sessionData.roomId).toBe(room.id);
    expect(sessionData.roomNumber).toBe('505');
    expect(sessionData.stayId).toBe(stay.id);
    expect(sessionData.guestName).toBe('Dr. Ngozi Okonjo');

    const guestToken = sessionData.token as string;
    const guestClient = new GuestClient(world.server, guestToken);

    // Verify session validity via GET /api/v1/guest/sessions/me
    const sessionMeResponse = await guestClient.get('/guest/sessions/me');
    expect(sessionMeResponse.status).toBe(200);
    expect(sessionMeResponse.body).toMatchObject({
      sessionId: sessionData.sessionId,
      hotelId: hotel.id,
      roomId: room.id,
      roomNumber: '505',
      stayId: stay.id,
    });

    // -------------------------------------------------------------------------
    // STEP 2: Browse Menu as Guest
    // -------------------------------------------------------------------------
    const menuResponse = await guestClient.get('/guest/menu');
    expect(menuResponse.status).toBe(200);
    expect(menuResponse.body.categories).toBeDefined();
    expect(menuResponse.body.categories.length).toBeGreaterThanOrEqual(3);

    const categoryNames = menuResponse.body.categories.map((c: { name: string }) => c.name);
    expect(categoryNames).toContain('Mains');
    expect(categoryNames).toContain('Beverages');
    expect(categoryNames).toContain('Desserts');

    // -------------------------------------------------------------------------
    // STEP 3: Establish Concurrent Staff and Guest WebSockets
    // -------------------------------------------------------------------------
    const staffDashboard = await LiveDashboard.open(world.server, hotel.staff.accessToken);
    expect(staffDashboard.messages[0]).toMatchObject({
      type: 'STAFF_CONNECTED',
      payload: { userId: hotel.staff.user.id, hotelId: hotel.id },
    });

    const guestSession = await LiveGuestSession.open(world.server, guestToken);
    expect(guestSession.messages[0]).toMatchObject({
      type: 'GUEST_CONNECTED',
      payload: {
        sessionId: sessionData.sessionId,
        roomNumber: '505',
      },
    });

    // -------------------------------------------------------------------------
    // STEP 4: Guest Submits Order via POST /api/v1/guest/orders
    // -------------------------------------------------------------------------
    // Total calculation: (7,500 * 2) + 2,500 = 17,500 NGN (1,750,000 minor units)
    const placeOrderResponse = await guestClient.post(
      '/guest/orders',
      {
        items: [
          { itemId: suyaItem.id, quantity: 2, notes: 'Extra yaji spice on the side' },
          { itemId: chapmanItem.id, quantity: 1 },
        ],
      },
      { 'idempotency-key': 'idem-e2e-order-gate-1' }
    );

    expect(placeOrderResponse.status).toBe(201);
    const orderPayload = placeOrderResponse.body;
    expect(orderPayload.id).toBeDefined();
    expect(orderPayload.orderNumber).toBeDefined();
    expect(orderPayload.hotelId).toBe(hotel.id);
    expect(orderPayload.roomId).toBe(room.id);
    expect(orderPayload.roomNumber).toBe('505');
    expect(orderPayload.stayId).toBe(stay.id);
    expect(orderPayload.status).toBe('PENDING');
    expect(orderPayload.totalAmount).toBe(17_500);
    expect(orderPayload.totalMinor).toBe(1_750_000);
    expect(orderPayload.items).toHaveLength(2);

    const orderId = orderPayload.id as string;
    const orderNumber = orderPayload.orderNumber as number;

    // Verify atomic database persistence: order row and outbox event
    const [persistedOrder] = await world.app.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
    expect(persistedOrder).toBeDefined();
    expect(persistedOrder.status).toBe('PENDING');
    expect(persistedOrder.totalMinor).toBe(1_750_000);

    const persistedOutboxRows = await world.app.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventName, 'order.created'));
    expect(persistedOutboxRows.length).toBeGreaterThanOrEqual(1);

    // -------------------------------------------------------------------------
    // STEP 5: Outbox Dispatch & Staff WebSocket Push (NEW_ORDER_RECEIVED)
    // -------------------------------------------------------------------------
    await world.deliverEvents();

    await staffDashboard.waitFor(
      () => staffDashboard.messagesOfType('NEW_ORDER_RECEIVED').length > 0
    );

    const [newOrderNotification] = staffDashboard.messagesOfType('NEW_ORDER_RECEIVED');
    expect(newOrderNotification).toBeDefined();
    expect(newOrderNotification.payload).toEqual({
      orderId,
      orderNumber,
      roomNumber: '505',
      totalAmount: 17_500,
      itemsSummary: 'Grilled Beef Suya ×2 · Signature Chapman',
      createdAt: persistedOrder.createdAt.toISOString(),
    });

    // -------------------------------------------------------------------------
    // STEP 6: Staff Accepts Order (PENDING -> IN_PROGRESS)
    // -------------------------------------------------------------------------
    const acceptResponse = await hotel.staff.patch(`/orders/${orderId}/status`, {
      status: 'IN_PROGRESS',
    });
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.status).toBe('IN_PROGRESS');

    await world.deliverEvents();

    // Assert guest receives real-time update
    await guestSession.waitFor(() =>
      guestSession
        .messagesOfType('ORDER_STATUS_UPDATED')
        .some((msg) => msg.payload.status === 'IN_PROGRESS')
    );
    const guestInProgressMessage = guestSession
      .messagesOfType('ORDER_STATUS_UPDATED')
      .find((msg) => msg.payload.status === 'IN_PROGRESS');
    expect(guestInProgressMessage).toBeDefined();
    expect(guestInProgressMessage?.payload).toMatchObject({
      orderId,
      status: 'IN_PROGRESS',
    });

    // Assert staff receives live status update
    await staffDashboard.waitFor(() =>
      staffDashboard
        .messagesOfType('ORDER_STATUS_CHANGED')
        .some((msg) => msg.payload.newStatus === 'IN_PROGRESS')
    );
    const staffInProgressMessage = staffDashboard
      .messagesOfType('ORDER_STATUS_CHANGED')
      .find((msg) => msg.payload.newStatus === 'IN_PROGRESS');
    expect(staffInProgressMessage?.payload).toMatchObject({
      orderId,
      orderNumber,
      previousStatus: 'PENDING',
      newStatus: 'IN_PROGRESS',
      changedBy: 'Chidi Eze',
    });

    // -------------------------------------------------------------------------
    // STEP 7: Staff Delivers Order (IN_PROGRESS -> DELIVERED)
    // -------------------------------------------------------------------------
    const deliverResponse = await hotel.staff.patch(`/orders/${orderId}/status`, {
      status: 'DELIVERED',
    });
    expect(deliverResponse.status).toBe(200);
    expect(deliverResponse.body.status).toBe('DELIVERED');

    await world.deliverEvents();

    // Assert guest receives real-time delivery update
    await guestSession.waitFor(() =>
      guestSession
        .messagesOfType('ORDER_STATUS_UPDATED')
        .some((msg) => msg.payload.status === 'DELIVERED')
    );
    const guestDeliveredMessage = guestSession
      .messagesOfType('ORDER_STATUS_UPDATED')
      .find((msg) => msg.payload.status === 'DELIVERED');
    expect(guestDeliveredMessage).toBeDefined();
    expect(guestDeliveredMessage?.payload).toMatchObject({
      orderId,
      status: 'DELIVERED',
    });

    // Assert staff dashboard receives delivery update
    await staffDashboard.waitFor(() =>
      staffDashboard
        .messagesOfType('ORDER_STATUS_CHANGED')
        .some((msg) => msg.payload.newStatus === 'DELIVERED')
    );
    const staffDeliveredMessage = staffDashboard
      .messagesOfType('ORDER_STATUS_CHANGED')
      .find((msg) => msg.payload.newStatus === 'DELIVERED');
    expect(staffDeliveredMessage?.payload).toMatchObject({
      orderId,
      orderNumber,
      previousStatus: 'IN_PROGRESS',
      newStatus: 'DELIVERED',
      changedBy: 'Chidi Eze',
    });

    // -------------------------------------------------------------------------
    // STEP 8: Guest Queries Tracking Endpoints
    // -------------------------------------------------------------------------
    const trackingDetailResponse = await guestClient.get(`/guest/orders/${orderId}`);
    expect(trackingDetailResponse.status).toBe(200);
    expect(trackingDetailResponse.body).toMatchObject({
      id: orderId,
      number: orderNumber,
      status: 'DELIVERED',
      totalAmount: 17_500,
      roomNumber: '505',
    });
    expect(trackingDetailResponse.body.items).toHaveLength(2);

    const guestOrderListResponse = await guestClient.get('/guest/orders');
    expect(guestOrderListResponse.status).toBe(200);
    expect(guestOrderListResponse.body).toHaveLength(1);
    expect(guestOrderListResponse.body[0].id).toBe(orderId);
    expect(guestOrderListResponse.body[0].status).toBe('DELIVERED');

    // -------------------------------------------------------------------------
    // STEP 9: Folio Billing and Payment
    // -------------------------------------------------------------------------
    const initialBillResponse = await hotel.receptionist.get(`/stays/${stay.id}/bill`);
    expect(initialBillResponse.status).toBe(200);
    expect(initialBillResponse.body).toMatchObject({
      stayId: stay.id,
      ordersCount: 1,
      totalCharged: 17_500,
      totalPaid: 0,
      outstanding: 17_500,
    });

    // Record guest payment
    const paymentResponse = await hotel.receptionist.post(`/orders/${orderId}/payments`, {
      method: 'CARD',
    });
    expect(paymentResponse.status).toBe(201);
    await world.deliverEvents();

    const reconciledBillResponse = await hotel.receptionist.get(`/stays/${stay.id}/bill`);
    expect(reconciledBillResponse.status).toBe(200);
    expect(reconciledBillResponse.body).toMatchObject({
      stayId: stay.id,
      totalCharged: 17_500,
      totalPaid: 17_500,
      outstanding: 0,
    });

    // -------------------------------------------------------------------------
    // STEP 10: Check-Out and Session / Socket Revocation
    // -------------------------------------------------------------------------
    const checkOutResponse = await hotel.receptionist.post(`/stays/${stay.id}/check-out`);
    expect(checkOutResponse.status).toBe(200);
    expect(checkOutResponse.body.checkedOutAt).toBeDefined();

    await world.deliverEvents();

    // Assert guest WebSocket receives SESSION_EXPIRED and is forcibly disconnected
    await guestSession.waitFor(() => guestSession.closeCode !== undefined);
    expect(guestSession.closeCode).toBe(4003);
    expect(guestSession.messagesOfType('SESSION_EXPIRED')).toHaveLength(1);
    expect(guestSession.messagesOfType('SESSION_EXPIRED')[0].payload.reason).toBe(
      'Stay has checked out'
    );

    // Assert guest session token validation is immediately rejected with HTTP 401
    const postCheckoutSessionMe = await guestClient.get('/guest/sessions/me');
    expect(postCheckoutSessionMe.status).toBe(401);

    // Assert subsequent order attempt by the checked-out guest is rejected
    const postCheckoutOrder = await guestClient.post('/guest/orders', {
      items: [{ itemId: puffPuffItem.id, quantity: 1 }],
    });
    expect(postCheckoutOrder.status).toBe(401);

    // Assert re-scanning the room QR token returns HTTP 403 ROOM_NOT_OCCUPIED
    const vacantScanResponse = await callAnonymously(
      world.server,
      'POST',
      '/guest/sessions',
      { qrToken: room.qrToken }
    );
    expect(vacantScanResponse.status).toBe(403);
    expect(vacantScanResponse.body.error.code).toBe('ROOM_NOT_OCCUPIED');

    // Cleanup open sockets
    staffDashboard.close();
    guestSession.close();
  });

  it('recovers missed events using Last-Event-ID reconnection protocol during an active stay', async () => {
    // 1. Resolve guest session
    const resolveRes = await callAnonymously(world.server, 'POST', '/guest/sessions', {
      qrToken: room.qrToken,
    });
    expect(resolveRes.status).toBe(201);
    const guestToken = resolveRes.body.token as string;
    const guestClient = new GuestClient(world.server, guestToken);

    // 2. Initial connection
    const guestClient1 = await LiveGuestSession.open(world.server, guestToken);

    // 3. Place order
    const orderRes = await guestClient.post('/guest/orders', {
      items: [{ itemId: puffPuffItem.id, quantity: 2 }],
    });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.id as string;

    // 4. Staff accepts order -> PENDING to IN_PROGRESS
    await hotel.staff.patch(`/orders/${orderId}/status`, { status: 'IN_PROGRESS' });
    await world.deliverEvents();

    await guestClient1.waitFor(
      () => guestClient1.messagesOfType('ORDER_STATUS_UPDATED').length > 0
    );
    const firstStatusMessage = guestClient1.messagesOfType('ORDER_STATUS_UPDATED')[0] as {
      eventId?: string;
      payload: { status: string };
    };
    expect(firstStatusMessage.payload.status).toBe('IN_PROGRESS');
    const lastEventId = firstStatusMessage.eventId;
    expect(lastEventId).toBeDefined();

    // 5. Guest temporarily drops connection (e.g. Wi-Fi handover / background lock)
    guestClient1.close();

    // 6. While guest is disconnected, staff marks order as DELIVERED
    await hotel.staff.patch(`/orders/${orderId}/status`, { status: 'DELIVERED' });
    await world.deliverEvents();

    // 7. Guest reconnects passing lastEventId
    const guestClient2 = await LiveGuestSession.open(world.server, guestToken, lastEventId);

    // Guest should receive GUEST_CONNECTED, then replayed DELIVERED status update
    await guestClient2.waitFor(
      () => guestClient2.messagesOfType('ORDER_STATUS_UPDATED').length > 0
    );

    const replayed = guestClient2.messagesOfType('ORDER_STATUS_UPDATED');
    expect(replayed).toHaveLength(1);
    expect(replayed[0].payload).toMatchObject({
      orderId,
      status: 'DELIVERED',
    });

    guestClient2.close();
  });

  it('guarantees idempotency on duplicate order submission without extra outbox events', async () => {
    const resolveRes = await callAnonymously(world.server, 'POST', '/guest/sessions', {
      qrToken: room.qrToken,
    });
    const guestToken = resolveRes.body.token as string;
    const guestClient = new GuestClient(world.server, guestToken);

    const idempotencyKey = 'idem-duplicate-prevention-test';

    // First attempt
    const res1 = await guestClient.post(
      '/guest/orders',
      { items: [{ itemId: suyaItem.id, quantity: 1 }] },
      { 'idempotency-key': idempotencyKey }
    );
    expect(res1.status).toBe(201);

    const initialOutboxCount = (
      await world.app.db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.eventName, 'order.created'))
    ).length;

    // Duplicate attempt with identical idempotency key
    const res2 = await guestClient.post(
      '/guest/orders',
      { items: [{ itemId: suyaItem.id, quantity: 1 }] },
      { 'idempotency-key': idempotencyKey }
    );
    expect(res2.status).toBe(201);
    expect(res2.body.id).toBe(res1.body.id);
    expect(res2.body.orderNumber).toBe(res1.body.orderNumber);

    const finalOutboxCount = (
      await world.app.db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.eventName, 'order.created'))
    ).length;

    expect(finalOutboxCount).toBe(initialOutboxCount);
  });
});
