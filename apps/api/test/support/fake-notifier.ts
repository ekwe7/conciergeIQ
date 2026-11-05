import { NotifierError, type Notifier, type OutgoingMessage } from '../../src/modules/escalations/index.js';

/** Records alerts instead of texting anyone. Can be told to fail, like a provider outage. */
export class FakeNotifier implements Notifier {
  readonly sent: OutgoingMessage[] = [];
  failWith: string | null = null;

  async send(message: OutgoingMessage): Promise<{ messageId: string | null }> {
    if (this.failWith) throw new NotifierError(this.failWith);
    this.sent.push(message);
    return { messageId: `fake-${this.sent.length}` };
  }

  reset(): void {
    this.sent.length = 0;
    this.failWith = null;
  }
}
