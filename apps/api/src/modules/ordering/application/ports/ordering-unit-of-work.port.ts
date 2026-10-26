import type { DomainEvent } from '@conciergeiq/contracts';
import type { OrderRepository } from './order.repository.js';

export interface OrderingTransaction {
  orders: OrderRepository;
  /** Saved with the order changes, then delivered to subscribers. */
  recordEvent(event: DomainEvent): Promise<void>;
}

/** Runs work in one database transaction: all of it is saved, or none of it. */
export interface OrderingUnitOfWork {
  run<T>(work: (tx: OrderingTransaction) => Promise<T>): Promise<T>;
}
