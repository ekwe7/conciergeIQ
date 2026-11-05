import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { callAnonymously } from '../support/staff-client.js';
import { TestWorld, type HotelFixture } from '../support/test-world.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

describe('Branding and languages', () => {
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

  it('starts with sensible defaults', async () => {
    const { body } = await hotel.staff.get('/hotel/branding');
    expect(body).toEqual({
      hotelId: hotel.id,
      hotelName: 'Azure Bay Hotel',
      logoUrl: null,
      brandColor: '#1B2A3A',
      accentColor: '#B8862F',
      welcomeHeadline: { en: 'Welcome to Room {room}' },
      languages: ['en'],
    });
  });

  it('lets the admin set colours, headlines and languages', async () => {
    const response = await hotel.admin.patch('/hotel/branding', {
      brandColor: '#0f4c45',
      accentColor: '#c0392b',
      welcomeHeadline: { en: 'Welcome to Room {room}', fr: 'Bienvenue dans la chambre {room}', yo: '' },
      languages: ['en', 'fr', 'ar'],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        brandColor: '#0F4C45',
        accentColor: '#C0392B',
        welcomeHeadline: { en: 'Welcome to Room {room}', fr: 'Bienvenue dans la chambre {room}' },
        languages: ['en', 'fr', 'ar'],
      }),
    );
  });

  it('keeps English on and checks the values', async () => {
    expect((await hotel.admin.patch('/hotel/branding', { languages: ['fr'] })).status).toBe(400);
    expect((await hotel.admin.patch('/hotel/branding', { languages: ['en', 'de'] })).status).toBe(400);
    expect((await hotel.admin.patch('/hotel/branding', { brandColor: 'blue' })).status).toBe(400);
  });

  it('serves the logo publicly, cache-friendly and safe', async () => {
    const upload = await hotel.admin.put('/hotel/logo', { contentType: 'image/png', data: PNG.toString('base64') });
    expect(upload.status).toBe(200);
    expect(upload.body.logoUrl).toMatch(new RegExp(`^/api/v1/hotels/${hotel.id}/logo\\?v=\\d+$`));

    const logo = await world.server.inject({ method: 'GET', url: upload.body.logoUrl });
    expect(logo.statusCode).toBe(200);
    expect(logo.rawPayload.equals(PNG)).toBe(true);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.headers['cache-control']).toContain('immutable');
    expect(logo.headers['content-security-policy']).toContain('sandbox');
    expect(logo.headers['x-content-type-options']).toBe('nosniff');

    const removed = await hotel.admin.delete('/hotel/logo');
    expect(removed.body.logoUrl).toBeNull();
    expect((await world.server.inject({ method: 'GET', url: upload.body.logoUrl })).statusCode).toBe(404);
  });

  it('refuses logos that are not safe images', async () => {
    const script = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
    const response = await hotel.admin.put('/hotel/logo', { contentType: 'image/svg+xml', data: script });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('contains scripts or links');
  });

  it('shows branding to guests without signing in', async () => {
    await hotel.admin.patch('/hotel/branding', { languages: ['en', 'yo'] });

    const response = await callAnonymously(world.server, 'GET', `/hotels/${hotel.id}/branding`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ hotelName: 'Azure Bay Hotel', languages: ['en', 'yo'] }));
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect((await callAnonymously(world.server, 'GET', '/hotels/00000000-0000-4000-8000-000000000000/branding')).status).toBe(404);
  });

  it('leaves branding to admins', async () => {
    expect((await hotel.manager.patch('/hotel/branding', { brandColor: '#000000' })).status).toBe(403);
    expect((await hotel.manager.put('/hotel/logo', { contentType: 'image/png', data: PNG.toString('base64') })).status).toBe(403);
  });

  it('stores menu translations for each language', async () => {
    const water = await hotel.addMenuItem('Water', 500, 'Drinks');

    const response = await hotel.manager.patch(`/menu/items/${water.id}`, {
      translations: { fr: { name: 'Eau', description: 'Plate, 75 cl' }, ha: { name: 'Ruwa' } },
    });

    expect(response.status).toBe(200);
    expect(response.body.translations).toEqual({ fr: { name: 'Eau', description: 'Plate, 75 cl' }, ha: { name: 'Ruwa' } });
    expect((await hotel.manager.patch(`/menu/items/${water.id}`, { translations: { de: { name: 'Wasser' } } })).status).toBe(400);
  });
});
