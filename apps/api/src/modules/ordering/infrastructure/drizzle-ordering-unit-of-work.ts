import type { Database } from '../../../shared/db/client.js';
import type { Outbox } from '../../../shared/events/outbox.repository.js';
import type { OrderingTransaction, OrderingUnitOfWork } from '../application/ports/ordering-unit-of-work.port.js';
import { DrizzleOrderRepository } from './drizzle-order.repository.js';

export class DrizzleOrderingUnitOfWork implements OrderingUnitOfWork {
  constructor(
    private readonly db: Database,
    private readonly outbox: Outbox,
  ) {}

  run<T>(work: (tx: OrderingTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      work({
        orders: new DrizzleOrderRepository(tx),
        recordEvent: (event) => this.outbox.record(tx, event),
      }),
    );
  }
}
