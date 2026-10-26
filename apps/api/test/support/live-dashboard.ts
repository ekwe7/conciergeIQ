import type { StaffWSMessage } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import type WebSocket from 'ws';

/** A staff dashboard's live connection, recording every message it receives. */
export class LiveDashboard {
  readonly messages: StaffWSMessage[] = [];
  closeCode: number | undefined;

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => this.messages.push(JSON.parse(data.toString())));
    socket.on('close', (code) => (this.closeCode = code));
  }

  static async open(server: FastifyInstance, accessToken: string): Promise<LiveDashboard> {
    const socket = await server.injectWS(`/ws/staff?accessToken=${encodeURIComponent(accessToken)}`);
    const dashboard = new LiveDashboard(socket);
    await dashboard.waitFor(() => dashboard.messages.length > 0 || dashboard.closeCode !== undefined);
    return dashboard;
  }

  messagesOfType<Type extends StaffWSMessage['type']>(type: Type) {
    return this.messages.filter((message): message is Extract<StaffWSMessage, { type: Type }> => message.type === type);
  }

  /** Waits briefly for something to arrive over the socket. */
  async waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for the live dashboard');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  close(): void {
    this.socket.terminate();
  }
}
