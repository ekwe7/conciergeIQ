import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { callAnonymously } from '../support/staff-client.js';
import { TEST_PASSWORD, TestWorld, type HotelFixture } from '../support/test-world.js';

describe('Staff sign-in', () => {
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

  const signIn = (email: string, password: string) =>
    callAnonymously(world.server, 'POST', '/auth/login', { email, password });
  const refresh = (refreshToken: string) => callAnonymously(world.server, 'POST', '/auth/refresh', { refreshToken });

  it('signs a receptionist in and tells the dashboard who they are', async () => {
    const response = await signIn(hotel.receptionist.user.email, TEST_PASSWORD);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ fullName: 'Amaka Obi', role: 'RECEPTIONIST', hotelId: hotel.id });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
  });

  it('accepts the email in any letter case', async () => {
    const response = await signIn(hotel.receptionist.user.email.toUpperCase(), TEST_PASSWORD);

    expect(response.status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await signIn(hotel.receptionist.user.email, 'not-the-password');
    const unknownEmail = await signIn('nobody@hotel1.test', TEST_PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('rejects requests without a valid access token', async () => {
    expect((await callAnonymously(world.server, 'GET', '/orders')).status).toBe(401);

    const forged = await world.server.inject({
      method: 'GET',
      url: '/api/v1/orders',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(forged.statusCode).toBe(401);
  });

  describe('refreshing a session', () => {
    it('swaps a refresh token for a new pair', async () => {
      const response = await refresh(hotel.receptionist.refreshToken);

      expect(response.status).toBe(200);
      expect(response.body.refreshToken).not.toBe(hotel.receptionist.refreshToken);
    });

    it('lets each refresh token be used only once', async () => {
      await refresh(hotel.receptionist.refreshToken);

      const secondUse = await refresh(hotel.receptionist.refreshToken);

      expect(secondUse.status).toBe(401);
    });

    it('ends every session when a used refresh token comes back, in case it was copied', async () => {
      const { body: rotated } = await refresh(hotel.receptionist.refreshToken);

      await refresh(hotel.receptionist.refreshToken);

      expect((await refresh(rotated.refreshToken)).status).toBe(401);
    });

    it('stops working after signing out', async () => {
      await callAnonymously(world.server, 'POST', '/auth/logout', { refreshToken: hotel.receptionist.refreshToken });

      expect((await refresh(hotel.receptionist.refreshToken)).status).toBe(401);
    });
  });

  describe('when an admin deactivates an account', () => {
    beforeEach(async () => {
      await hotel.admin.patch(`/users/${hotel.staff.user.id}`, { isActive: false });
    });

    it('blocks the access token the person already has, straight away', async () => {
      const response = await hotel.staff.get('/orders');

      expect(response.status).toBe(401);
    });

    it('blocks their refresh token and signing in again', async () => {
      expect((await refresh(hotel.staff.refreshToken)).status).toBe(401);
      expect((await signIn(hotel.staff.user.email, TEST_PASSWORD)).status).toBe(401);
    });
  });
});
