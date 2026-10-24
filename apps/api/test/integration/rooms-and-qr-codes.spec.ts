import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

describe('Rooms and QR codes', () => {
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

  it('lets an admin add a whole floor of rooms at once', async () => {
    const response = await hotel.admin.post('/rooms/bulk', {
      rooms: [
        { number: '101', floor: 1 },
        { number: '102', floor: 1 },
        { number: '201', floor: 2 },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body.map((room: { number: string }) => room.number)).toEqual(['101', '102', '201']);
  });

  it('lists rooms by floor', async () => {
    await hotel.addRoom('101');
    await hotel.addRoom('201');

    const { body: floorTwo } = await hotel.receptionist.get('/rooms', { floor: '2' });

    expect(floorTwo.map((room: { number: string }) => room.number)).toEqual(['201']);
  });

  it('refuses a room number the hotel already has', async () => {
    await hotel.addRoom('101');

    const response = await hotel.admin.post('/rooms', { number: '101', floor: 1 });

    expect(response.status).toBe(409);
  });

  it('gives every room an unguessable QR link that does not contain the room number', async () => {
    const room = await hotel.addRoom('101');

    expect(room.qrToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(room.qrToken).not.toContain('101');
    expect(room.qrUrl).toBe(`https://guest.test/r/${room.qrToken}`);
  });

  it('replaces a leaked QR code so the old one stops matching the room', async () => {
    const room = await hotel.addRoom('101');

    const { body: regenerated } = await hotel.admin.post(`/rooms/${room.id}/qr/regenerate`);

    expect(regenerated.qrToken).not.toBe(room.qrToken);
    expect(regenerated.qrRegeneratedAt).toBe(world.clock.now().toISOString());
    expect(await world.app.modules.rooms.rooms.findRoomByQrToken(room.qrToken)).toBeUndefined();
  });

  it('regenerates the selected rooms together', async () => {
    const roomA = await hotel.addRoom('101');
    const roomB = await hotel.addRoom('102');

    const response = await hotel.admin.post('/rooms/qr/regenerate', { roomIds: [roomA.id, roomB.id] });

    expect(response.body).toHaveLength(2);
  });

  it('marks a room out of order with a reason, and clears the reason when it is fixed', async () => {
    const room = await hotel.addRoom('105');

    const broken = await hotel.admin.patch(`/rooms/${room.id}`, { isOutOfOrder: true, outOfOrderReason: 'AC repair' });
    const fixed = await hotel.admin.patch(`/rooms/${room.id}`, { isOutOfOrder: false });

    expect(broken.body).toMatchObject({ isOutOfOrder: true, outOfOrderReason: 'AC repair' });
    expect(fixed.body).toMatchObject({ isOutOfOrder: false, outOfOrderReason: null });
  });

  it('downloads a print-ready PDF with one card per room', async () => {
    await hotel.addRoom('101');
    await hotel.addRoom('102');

    const response = await world.server.inject({
      method: 'GET',
      url: '/api/v1/rooms/qr.pdf',
      headers: { authorization: `Bearer ${hotel.admin.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(response.rawPayload.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
  });

  it('does not let a receptionist change rooms or print codes', async () => {
    const room = await hotel.addRoom('101');

    expect((await hotel.receptionist.post(`/rooms/${room.id}/qr/regenerate`)).status).toBe(403);
    expect((await hotel.receptionist.get('/rooms/qr.pdf')).status).toBe(403);
  });
});
