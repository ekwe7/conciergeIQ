import type { GuestWSMessage } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import type WebSocket from 'ws';

/**
 * A guest mobile browser's live connection, capturing all received WebSocket messages
 * and tracking socket lifecycle events.
 */
export class LiveGuestSession {
  readonly messages: GuestWSMessage[] = [];
  closeCode: number | undefined;
  closeReason: string | undefined;

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => {
      try {
        this.messages.push(JSON.parse(data.toString()));
      } catch {
        // ignore malformed payloads
      }
    });

    socket.on('close', (code, reason) => {
      this.closeCode = code;
      this.closeReason = reason.toString();
    });
  }

  /**
   * Connects a guest WebSocket client to /ws/guest with the specified session token.
   */
  static async open(
    server: FastifyInstance,
    token: string,
    lastEventId?: string
  ): Promise<LiveGuestSession> {
    const url = lastEventId
      ? `/ws/guest?token=${encodeURIComponent(token)}&lastEventId=${encodeURIComponent(lastEventId)}`
      : `/ws/guest?token=${encodeURIComponent(token)}`;

    const socket = await server.injectWS(url);
    const guest = new LiveGuestSession(socket);
    await guest.waitFor(() => guest.messages.length > 0 || guest.closeCode !== undefined);
    return guest;
  }

  /**
   * Filters received messages by specific contract type.
   */
  messagesOfType<Type extends GuestWSMessage['type']>(type: Type) {
    return this.messages.filter(
      (message): message is Extract<GuestWSMessage, { type: Type }> => message.type === type
    );
  }

  /**
   * Deterministically awaits a socket condition with a timeout to avoid hanging tests.
   */
  async waitFor(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for guest live socket condition');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Gracefully terminates the socket connection.
   */
  close(): void {
    try {
      this.socket.terminate();
    } catch {
      // ignore
    }
  }
}
