import { describe, expect, it } from 'vitest';
import { localizeCategoryName, localizeItem } from '../domain/localize.js';
import { isServedAt, localTimeIn } from '../domain/service-hours.js';

describe('service hours', () => {
  it('serves all day when no hours are set', () => {
    expect(isServedAt(null, null, '03:00')).toBe(true);
  });

  it('serves breakfast from 06:30 up to, not including, 11:00', () => {
    expect(isServedAt('06:30', '11:00', '06:29')).toBe(false);
    expect(isServedAt('06:30', '11:00', '06:30')).toBe(true);
    expect(isServedAt('06:30', '11:00', '10:59')).toBe(true);
    expect(isServedAt('06:30', '11:00', '11:00')).toBe(false);
  });

  it('runs late-night hours past midnight', () => {
    expect(isServedAt('22:00', '02:00', '21:59')).toBe(false);
    expect(isServedAt('22:00', '02:00', '23:30')).toBe(true);
    expect(isServedAt('22:00', '02:00', '01:59')).toBe(true);
    expect(isServedAt('22:00', '02:00', '02:00')).toBe(false);
  });

  it('reads the time in the hotel time zone', () => {
    expect(localTimeIn(new Date('2026-10-24T05:45:00Z'), 'Africa/Lagos')).toBe('06:45');
    expect(localTimeIn(new Date('2026-10-24T23:10:00Z'), 'Africa/Lagos')).toBe('00:10');
  });
});

describe('translations', () => {
  const item = { name: 'Water', description: 'Still, 75 cl', translations: { fr: { name: 'Eau' } } };

  it('uses the translation and falls back for anything missing', () => {
    expect(localizeItem(item, 'fr')).toEqual({ name: 'Eau', description: 'Still, 75 cl' });
    expect(localizeItem(item, 'ha')).toEqual({ name: 'Water', description: 'Still, 75 cl' });
    expect(localizeItem({ ...item, translations: { fr: { name: '  ' } } }, 'fr').name).toBe('Water');
    expect(localizeCategoryName({ name: 'Drinks', translations: { yo: { name: 'Ohun mimu' } } }, 'yo')).toBe('Ohun mimu');
  });
});
