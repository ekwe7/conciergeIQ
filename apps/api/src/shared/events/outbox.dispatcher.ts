import { asc, eq, isNull } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Database } from '../db/client.js';
import type { EventBus } from './event-bus.js';
import { outboxEvents } from './outbox.schema.js';

const BATCH_SIZE = 100;

/** Delivers recorded events to the event bus, oldest first, and marks them published. */
export class OutboxDispatcher {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<number> | undefined;

  constructor(
    private readonly db: Database,
    private readonly bus: EventBus,
    private readonly logger: FastifyBaseLogger,
  ) {}

  start(pollIntervalMs: number): void {
    this.timer = setInterval(() => void this.dispatchPending().catch(() => {}), pollIntervalMs);
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Delivers everything waiting in the outbox. Returns how many events were delivered. */
  async dispatchPending(): Promise<number> {
    if (!this.running) {
      this.running = this.dispatchAll().finally(() => (this.running = undefined));
    }
    return this.running;
  }

  private async dispatchAll(): Promise<number> {
    let delivered = 0;
    let batch: number;
    do {
      batch = await this.dispatchBatch();
      delivered += batch;
    } while (batch === BATCH_SIZE);
    return delivered;
  }

  private async dispatchBatch(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const pending = await tx
        .select()
        .from(outboxEvents)
        .where(isNull(outboxEvents.publishedAt))
        .orderBy(asc(outboxEvents.id))
        .limit(BATCH_SIZE)
        .for('update', { skipLocked: true });

      for (const row of pending) {
        try {
          await this.bus.publish(row.payload, { eventId: String(row.id) });
        } catch (error) {
          // Stop here so events keep their order; the next run retries this one.
          this.logger.error({ err: error, eventId: row.id, eventName: row.eventName }, 'Event handler failed');
          return pending.indexOf(row);
        }
        await tx.update(outboxEvents).set({ publishedAt: new Date() }).where(eq(outboxEvents.id, row.id));
      }
      return pending.length;
    });
  }
}
