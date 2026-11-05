import type { EscalationChannel } from '@conciergeiq/contracts';

export interface OutgoingMessage {
  /** E.164, e.g. +2348031234412. */
  to: string;
  channel: EscalationChannel;
  text: string;
}

/** Sends a text message. Throws `NotifierError` with a message safe to show to admins. */
export interface Notifier {
  send(message: OutgoingMessage): Promise<{ messageId: string | null }>;
}

export class NotifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotifierError';
  }
}
