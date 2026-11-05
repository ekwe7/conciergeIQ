import type { GuestMenu } from '@conciergeiq/contracts';
import { describe, expect, it } from 'vitest';
import { checkDraft } from '../domain/draft.js';
import { knowledgeBlock, menuBlock } from '../domain/prompt.js';
import { RateWindow } from '../domain/rate-window.js';

const menu: GuestMenu = {
  language: 'en',
  featured: [],
  categories: [
    {
      id: 'c1',
      name: 'Breakfast',
      availableFrom: '06:30',
      availableUntil: '11:00',
      isOpenNow: true,
      items: [
        { id: 'i1', categoryId: 'c1', name: 'Pancakes', description: null, price: 3000, photoUrl: null, isAvailable: true, isFeatured: false, pairsWith: [] },
        { id: 'i2', categoryId: 'c1', name: 'Omelette', description: 'Three eggs', price: 2500, photoUrl: null, isAvailable: false, isFeatured: false, pairsWith: [] },
      ],
    },
  ],
};

describe('draft checks', () => {
  it('keeps menu items, merges repeats, caps quantities and prices from the menu', () => {
    const draft = checkDraft(
      {
        items: [
          { itemId: 'i1', quantity: 2, note: ' warm ' },
          { itemId: 'i1', quantity: 1, note: '' },
          { itemId: 'i2', quantity: 1, note: '' },
          { itemId: 'nope', quantity: 1, note: '' },
          { itemId: 'i1', quantity: 0, note: '' },
        ],
        deliveryNote: '  ',
      },
      menu,
    );
    expect(draft).toEqual({
      items: [{ itemId: 'i1', name: 'Pancakes', quantity: 3, unitPrice: 3000, note: 'warm' }],
      deliveryNote: null,
      estimatedTotal: 9000,
    });
  });

  it('returns nothing when no line survives', () => {
    expect(checkDraft({ items: [{ itemId: 'i2', quantity: 1, note: '' }], deliveryNote: '' }, menu)).toBeNull();
  });
});

describe('prompt', () => {
  it('lists articles by id and marks what cannot be ordered now', () => {
    expect(knowledgeBlock({ hotelName: 'Azure Bay', articles: [{ id: 'a1', title: 'Wi-Fi "guest"', body: 'Password x' }] })).toContain(
      '<article id="a1" title="Wi-Fi &quot;guest&quot;">\nPassword x\n</article>',
    );
    const block = menuBlock({ menu, localTime: 'Saturday 07:05', currency: 'NGN', language: 'yo' });
    expect(block).toContain('- [i1] Pancakes, 3000 NGN, available now');
    expect(block).toContain('- [i2] Omelette, 2500 NGN, not available now - Three eggs');
    expect(block).toContain('Breakfast (served 06:30-11:00):');
    expect(block).toContain('Reply in Yorùbá (yo).');
  });
});

describe('rate window', () => {
  it('allows the limit per window per key', () => {
    const window = new RateWindow(2, 1000);
    expect([window.allow('a', 0), window.allow('a', 10), window.allow('a', 20), window.allow('b', 20)]).toEqual([true, true, false, true]);
    expect(window.allow('a', 1001)).toBe(true);
  });
});
