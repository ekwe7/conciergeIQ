import type { DomainEvent } from '@conciergeiq/contracts';
import type { DbExecutor } from '../db/client.js';
import { outboxEvents } from './outbox.schema.js';

/**
 * Records events in the same transaction as the change that raised them,
 * so a change is never saved without its event, or the other way round.
 */
export class Outbox {
  async record(tx: DbExecutor, event: DomainEvent): Promise<void> {
    await tx.insert(outboxEvents).values({
      eventName: event.eventName,
      hotelId: event.hotelId,
      payload: event,
      occurredAt: new Date(event.occurredAt),
    });
  }
}
