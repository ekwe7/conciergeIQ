import { describe, expect, it, vi } from 'vitest';
import { alertMessage, formatWait } from '../domain/alert-message.js';
import { maskPhone, normalizePhone } from '../domain/phone.js';
import { NotifierError } from '../application/notifier.port.js';
import { TermiiNotifier } from '../infrastructure/termii.notifier.js';

describe('phone numbers', () => {
  it('reads Nigerian and international formats', () => {
    expect(normalizePhone('0803 123 4412')).toBe('+2348031234412');
    expect(normalizePhone('+234 802 555 9017')).toBe('+2348025559017');
    expect(normalizePhone('2348025559017')).toBe('+2348025559017');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('0044 20 7946 0958')).toBe('+442079460958');
  });

  it('rejects what cannot be a phone number', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('call reception')).toBeNull();
    expect(normalizePhone('5551234567')).toBeNull();
  });

  it('masks the middle digits', () => {
    expect(maskPhone('+2348031234412')).toBe('+234 803 ••• 4412');
  });
});

describe('alert text', () => {
  it('says where, what and how long, and links to the order', () => {
    const text = alertMessage({
      hotelName: 'Azure Bay',
      roomNumber: '318',
      orderNumber: 1046,
      itemsSummary: 'Extra towels',
      waitedSeconds: 125,
      managerAlerted: false,
      link: 'https://staff.example/orders?order=1',
    });
    expect(text).toBe(
      'Azure Bay: Room 318 order A-1046 (Extra towels) has waited 2 min 5 s without being accepted. https://staff.example/orders?order=1',
    );
  });

  it('shortens long orders so the message stays short', () => {
    const text = alertMessage({
      hotelName: 'H',
      roomNumber: '1',
      orderNumber: 1,
      itemsSummary: 'Jollof rice & grilled chicken · Azure club burger · Chapman ×2',
      waitedSeconds: 300,
      managerAlerted: true,
      link: 'L',
    });
    const summary = text.match(/\((.*)\)/)?.[1] ?? '';
    expect(summary.length).toBeLessThanOrEqual(40);
    expect(summary.startsWith('Jollof rice & grilled chicken')).toBe(true);
    expect(summary.endsWith('…')).toBe(true);
    expect(text).toContain('The manager was already alerted.');
  });

  it('formats waits', () => {
    expect(formatWait(45)).toBe('45 s');
    expect(formatWait(120)).toBe('2 min');
    expect(formatWait(150)).toBe('2 min 30 s');
  });
});

describe('Termii', () => {
  const options = { apiKey: 'key', baseUrl: 'https://v3.api.termii.com/', senderId: 'AzureBay', smsChannel: 'dnd' as const };

  it('sends SMS on the DND route and WhatsApp on the WhatsApp route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 'ok', message_id: '301' }), { status: 200 }));
    const termii = new TermiiNotifier({ ...options, fetch: fetchMock as unknown as typeof fetch });

    expect(await termii.send({ to: '+2348031234412', channel: 'SMS', text: 'Hi' })).toEqual({ messageId: '301' });
    await termii.send({ to: '+2348031234412', channel: 'WHATSAPP', text: 'Hi' });

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe('https://v3.api.termii.com/api/sms/send');
    expect(JSON.parse(String(calls[0][1].body))).toEqual({
      api_key: 'key',
      to: '2348031234412',
      from: 'AzureBay',
      sms: 'Hi',
      type: 'plain',
      channel: 'dnd',
    });
    expect(JSON.parse(String(calls[1][1].body)).channel).toBe('whatsapp');
  });

  it('turns a refusal into a message an admin can act on', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Insufficient balance' }), { status: 400 }));
    const termii = new TermiiNotifier({ ...options, fetch: fetchMock as unknown as typeof fetch });

    await expect(termii.send({ to: '+2348031234412', channel: 'SMS', text: 'Hi' })).rejects.toEqual(
      new NotifierError('Termii refused the message (400): Insufficient balance'),
    );
  });

  it('reports an unreachable provider without leaking details', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed: getaddrinfo ENOTFOUND');
    });
    const termii = new TermiiNotifier({ ...options, fetch: fetchMock as unknown as typeof fetch });

    await expect(termii.send({ to: '+2348031234412', channel: 'SMS', text: 'Hi' })).rejects.toEqual(
      new NotifierError('Could not reach Termii'),
    );
  });
});
