import { OrderStatus } from '../order-status.js';
import { CancelledState } from './cancelled.state.js';
import { DeliveredState } from './delivered.state.js';
import { InProgressState } from './in-progress.state.js';
import type { OrderState } from './order-state.js';
import { PendingState } from './pending.state.js';

export function stateForStatus(status: OrderStatus): OrderState {
  switch (status) {
    case OrderStatus.PENDING:
      return new PendingState();
    case OrderStatus.IN_PROGRESS:
      return new InProgressState();
    case OrderStatus.DELIVERED:
      return new DeliveredState();
    case OrderStatus.CANCELLED:
      return new CancelledState();
  }
}
