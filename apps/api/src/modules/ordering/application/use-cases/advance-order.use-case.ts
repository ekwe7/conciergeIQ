import type { OrderStatus } from '@conciergeiq/contracts';
import type { Clock } from '../../../../shared/utils/clock.js';
import { NotFoundError } from '../../../../shared/errors/app-error.js';
import { actorOf, type SignedInStaff } from '../../../identity/index.js';
import { InvalidOrderTransitionError } from '../../domain/errors.js';
import { orderStatusChanged } from '../order-events.js';
import type { OrderingUnitOfWork } from '../ports/ordering-unit-of-work.port.js';

export interface AdvanceOrderCommand {
  actor: SignedInStaff;
  orderId: string;
  /** The status the staff member expects to move to. Stops a double tap from skipping a step. */
  toStatus: OrderStatus;
}

/** Accept (`PENDING` -> `IN_PROGRESS`) or deliver (`IN_PROGRESS` -> `DELIVERED`). */
export class AdvanceOrderUseCase {
  constructor(
    private readonly unitOfWork: OrderingUnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute({ actor, orderId, toStatus }: AdvanceOrderCommand): Promise<void> {
    await this.unitOfWork.run(async ({ orders, recordEvent }) => {
      const order = await orders.findById(actor.hotelId, orderId);
      if (!order) throw new NotFoundError('Order');

      const now = this.clock.now();
      const change = order.advance(now);
      if (change.to !== toStatus) {
        throw new InvalidOrderTransitionError(`This order is ${change.from} and cannot move to ${toStatus}`);
      }

      await orders.saveStatusChange(order, change, { userId: actor.id, name: actor.fullName });
      await recordEvent(orderStatusChanged(order, change, actorOf(actor), now));
    });
  }
}
