import type { FastifyBaseLogger } from 'fastify';
import type { Notifier, OutgoingMessage } from '../application/notifier.port.js';

/** Used when Termii is not configured (development): writes the message to the log instead of sending it. */
export class LogNotifier implements Notifier {
  constructor(private readonly log: Pick<FastifyBaseLogger, 'info'>) {}

  async send(message: OutgoingMessage): Promise<{ messageId: string | null }> {
    this.log.info({ to: message.to, channel: message.channel, text: message.text }, 'Escalation alert (not sent: Termii is not configured)');
    return { messageId: null };
  }
}
