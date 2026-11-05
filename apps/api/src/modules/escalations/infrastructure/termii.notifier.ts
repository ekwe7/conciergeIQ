import { EscalationChannel } from '@conciergeiq/contracts';
import { NotifierError, type Notifier, type OutgoingMessage } from '../application/notifier.port.js';

export interface TermiiOptions {
  apiKey: string;
  /** Account-specific, from the Termii dashboard, e.g. https://v3.api.termii.com */
  baseUrl: string;
  /** Approved sender ID (3–11 characters), or the WhatsApp device name. */
  senderId: string;
  /** `dnd` reaches numbers on Do-Not-Disturb, which most Nigerian lines are. */
  smsChannel: 'dnd' | 'generic';
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Sends SMS and WhatsApp messages through Termii's Send Message API. */
export class TermiiNotifier implements Notifier {
  constructor(private readonly options: TermiiOptions) {}

  async send(message: OutgoingMessage): Promise<{ messageId: string | null }> {
    const doFetch = this.options.fetch ?? fetch;
    const url = `${this.options.baseUrl.replace(/\/+$/, '')}/api/sms/send`;
    let response: Response;
    try {
      response = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          api_key: this.options.apiKey,
          to: message.to.replace(/^\+/, ''),
          from: this.options.senderId,
          sms: message.text,
          type: 'plain',
          channel: message.channel === EscalationChannel.WHATSAPP ? 'whatsapp' : this.options.smsChannel,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new NotifierError(
        error instanceof Error && error.name === 'TimeoutError' ? 'Termii did not respond in time' : 'Could not reach Termii',
      );
    }

    const body = (await response.json().catch(() => null)) as { message_id?: string; message?: string } | null;
    if (!response.ok) {
      // Termii explains rejections (e.g. unapproved sender ID, low balance) in `message`.
      throw new NotifierError(`Termii refused the message (${response.status})${body?.message ? `: ${body.message}` : ''}`);
    }
    return { messageId: body?.message_id ?? null };
  }
}
