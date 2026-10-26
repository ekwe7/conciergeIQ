import type { DomainEvent } from '@conciergeiq/contracts';
import type { DbExecutor } from '../db/client.js';
import { outboxEvents } from './outbox.schema.js';

/**
 * WHAT IT DOES:
 * Represents an individual outbox record payload stored in persistence.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Decouples the domain representation of an outbox row from Drizzle ORM table models.
 * - Allows in-memory mocks and database implementations to share the exact same structural record type.
 */
export interface OutboxRecord {
  readonly id?: number | string;
  readonly eventName: string;
  readonly hotelId?: string;
  readonly payload: DomainEvent;
  readonly occurredAt: Date;
  readonly publishedAt?: Date | null;
}

/**
 * WHAT IT DOES:
 * Contract interface for transactional outbox persistence operations.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Guaranteed Delivery: The Outbox pattern requires that business entity mutations and domain events
 *   are recorded inside the EXACT same database transaction (`DbExecutor`).
 * - Decoupling: Services depend on this interface rather than direct SQL tables, enabling unit testing 
 *   with `InMemoryOutboxRepository` without needing a live PostgreSQL instance.
 */
export interface OutboxRepository {
  record(transactionExecutor: DbExecutor, domainEventToRecord: DomainEvent): Promise<void>;
  save?(domainEventToRecord: DomainEvent): Promise<void>;
  fetchUnpublished?(limitBatchSize: number): Promise<ReadonlyArray<OutboxRecord>>;
}

/**
 * WHAT IT DOES:
 * Production Drizzle ORM implementation of the transactional Outbox repository.
 * Records domain events in the PostgreSQL `outbox_events` table inside an open transaction.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Guarantees that if a transaction rolls back (e.g. order creation fails), the outbox event is also rolled back.
 * - If the transaction commits, the event is guaranteed to exist on disk for the background outbox worker to dispatch.
 */
export class Outbox implements OutboxRepository {
  public record = async (
    transactionExecutor: DbExecutor,
    domainEventToRecord: DomainEvent
  ): Promise<void> => {
    await transactionExecutor.insert(outboxEvents).values({
      eventName: domainEventToRecord.eventName,
      hotelId: domainEventToRecord.hotelId,
      payload: domainEventToRecord,
      occurredAt: new Date(domainEventToRecord.occurredAt),
    });
  };
}

/**
 * WHAT IT DOES:
 * In-memory implementation of the OutboxRepository for unit and integration testing.
 * Records events in an in-memory collection without connecting to PostgreSQL.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Enables lightning-fast unit tests for use cases and domain services without database I/O.
 * - Provides inspection helpers (`getRecordedEvents()`, `clearRecordedEvents()`) so tests can assert 
 *   that domain events were staged correctly.
 */
export class InMemoryOutboxRepository implements OutboxRepository {
  private readonly storedOutboxRecords: OutboxRecord[] = [];
  private currentAutoIncrementId = 1;

  public record = async (
    _transactionExecutor: DbExecutor,
    domainEventToRecord: DomainEvent
  ): Promise<void> => {
    await this.save(domainEventToRecord);
  };

  public save = async (domainEventToRecord: DomainEvent): Promise<void> => {
    const newRecord: OutboxRecord = {
      id: this.currentAutoIncrementId++,
      eventName: domainEventToRecord.eventName,
      hotelId: domainEventToRecord.hotelId,
      payload: domainEventToRecord,
      occurredAt: new Date(domainEventToRecord.occurredAt),
      publishedAt: null,
    };
    this.storedOutboxRecords.push(newRecord);
  };

  public fetchUnpublished = async (
    limitBatchSize = 100
  ): Promise<ReadonlyArray<OutboxRecord>> => {
    const unpublishedRecords = this.storedOutboxRecords
      .filter((recordedEntry) => recordedEntry.publishedAt === null)
      .slice(0, limitBatchSize);

    return Object.freeze([...unpublishedRecords]);
  };

  public markAsPublished = async (outboxRecordIdentifier: number | string): Promise<void> => {
    const targetRecord = this.storedOutboxRecords.find(
      (entry) => entry.id === outboxRecordIdentifier
    );
    if (targetRecord) {
      (targetRecord as { publishedAt: Date | null }).publishedAt = new Date();
    }
  };

  public getRecordedEvents = (): ReadonlyArray<OutboxRecord> => {
    return Object.freeze([...this.storedOutboxRecords]);
  };

  public clearRecordedEvents = (): void => {
    this.storedOutboxRecords.length = 0;
  };

  public get recordedEventCount(): number {
    return this.storedOutboxRecords.length;
  }
}
