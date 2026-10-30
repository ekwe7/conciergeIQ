/**
 * WHAT IT DOES:
 * Integration test verifying that checking out a guest stay (`stay.checked_out`)
 * immediately invalidates active guest sessions and associated WebSockets:
 * 1. Checks in a room and resolves guest session via QR token.
 * 2. Connects guest live WebSocket and verifies normal communication.
 * 3. Triggers guest check-out via receptionist endpoint (`POST /stays/:stayId/check-out`).
 * 4. Delivers domain events (`stay.checked_out`) through the event bus and outbox.
 * 5. Asserts the guest WebSocket is forcibly terminated with code 4003 (Stay checked out).
 * 6. Asserts the guest session token is rejected with HTTP 401 across all guest endpoints.
 * 7. Asserts the room QR code returns HTTP 403 ROOM_NOT_OCCUPIED until a new check-in occurs.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Fulfills Sprint 2 Day 8 (S2-ENG-07) integration test requirements.
 * - Guarantees security and tenant isolation: guests departing the property cannot
 *   view subsequent room orders or send requests billed to future occupants.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MenuItem, Room, Stay } from '@conciergeiq/contracts';
import { TestWorld, type HotelFixture } from '../support/test-world.js';
import { callAnonymously } from '../support/staff-client.js';
import { LiveGuestSession } from '../support/live-guest.js';
import { GuestClient } from '../support/guest-client.js';

describe('Checkout Invalidates Session Integration Test', () => {
  let world: TestWorld;
  let hotel: HotelFixture;
  let room: Room;
  let stay: Stay;
  let jollofItem: MenuItem;

  beforeAll(async () => {
    world = await TestWorld.start();
  });

  afterAll(async () => {
    await world.stop();
  });

  beforeEach(async () => {
    await world.reset();
    hotel = await world.createHotel('Eko Atlantic Towers');
    room = await hotel.addRoom('204', 2);
    jollofItem = await hotel.addMenuItem('Signature Jollof', 5_000, 'Mains');
    stay = await hotel.checkIn(room, 'Chief Adekunle');
  });

  it('immediately invalidates guest sessions, terminates active WebSockets, and rejects further requests upon checkout', async () => {
    // 1. Resolve guest session from room QR token
    const resolveResponse = await callAnonymously(world.server, 'POST', '/guest/sessions', {
      qrToken: room.qrToken,
    });
    expect(resolveResponse.status).toBe(201);
    const guestToken = resolveResponse.body.token as string;
    const guestClient = new GuestClient(world.server, guestToken);

    // 2. Guest can verify session and access menu
    const meResponse = await guestClient.get('/guest/sessions/me');
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.roomNumber).toBe('204');

    const menuResponse = await guestClient.get('/guest/menu');
    expect(menuResponse.status).toBe(200);

    // 3. Connect live guest WebSocket
    const guestSocket = await LiveGuestSession.open(world.server, guestToken);
    expect(guestSocket.messages[0]).toMatchObject({
      type: 'GUEST_CONNECTED',
      payload: { roomNumber: '204' },
    });

    // 4. Guest places an initial order successfully
    const orderResponse = await guestClient.post('/guest/orders', {
      items: [{ itemId: jollofItem.id, quantity: 1 }],
    });
    expect(orderResponse.status).toBe(201);

    // 5. Receptionist performs guest check-out
    const checkOutResponse = await hotel.receptionist.post(`/stays/${stay.id}/check-out`);
    expect(checkOutResponse.status).toBe(200);
    expect(checkOutResponse.body.checkedOutAt).toBeDefined();

    // 6. Deliver outbox events to subscribers (including stay-checked-out subscriber & realtime dispatcher)
    await world.deliverEvents();

    // 7. Verify guest WebSocket receives SESSION_EXPIRED and is closed with 4003
    await guestSocket.waitFor(() => guestSocket.closeCode !== undefined);
    expect(guestSocket.closeCode).toBe(4003);
    const expiredMessages = guestSocket.messagesOfType('SESSION_EXPIRED');
    expect(expiredMessages).toHaveLength(1);
    expect(expiredMessages[0].payload.reason).toBe('Stay has checked out');

    // 8. Subsequent guest requests with the checked-out session token are rejected with HTTP 401
    const postCheckoutMe = await guestClient.get('/guest/sessions/me');
    expect(postCheckoutMe.status).toBe(401);

    const postCheckoutOrder = await guestClient.post('/guest/orders', {
      items: [{ itemId: jollofItem.id, quantity: 1 }],
    });
    expect(postCheckoutOrder.status).toBe(401);

    const postCheckoutOrderList = await guestClient.get('/guest/orders');
    expect(postCheckoutOrderList.status).toBe(401);

    // 9. Scanning the QR token of the now-vacant room rejects session resolution with HTTP 403 ROOM_NOT_OCCUPIED
    const vacantScanResponse = await callAnonymously(world.server, 'POST', '/guest/sessions', {
      qrToken: room.qrToken,
    });
    expect(vacantScanResponse.status).toBe(403);
    expect(vacantScanResponse.body.error.code).toBe('ROOM_NOT_OCCUPIED');

    // 10. Checking in a new guest generates a valid active stay and permits fresh session issuance
    const nextStay = await hotel.checkIn(room, 'Dr. Amina Yusuf');
    expect(nextStay.id).not.toBe(stay.id);

    const newGuestResolve = await callAnonymously(world.server, 'POST', '/guest/sessions', {
      qrToken: room.qrToken,
    });
    expect(newGuestResolve.status).toBe(201);
    expect(newGuestResolve.body.stayId).toBe(nextStay.id);
    expect(newGuestResolve.body.guestName).toBe('Dr. Amina Yusuf');

    guestSocket.close();
  });
});
