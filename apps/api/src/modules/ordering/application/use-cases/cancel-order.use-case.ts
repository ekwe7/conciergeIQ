import type { Clock } from '../../../../shared/utils/clock.js';
import { NotFoundError } from '../../../../shared/errors/app-error.js';
import { actorOf, type SignedInStaff } from '../../../identity/index.js';
import { orderStatusChanged } from '../order-events.js';
import type { OrderingUnitOfWork } from '../ports/ordering-unit-of-work.port.js';

export interface CancelOrderCommand {
  actor: SignedInStaff;
  orderId: string;
  reason: string;
}

export class CancelOrderUseCase {
  constructor(
    private readonly unitOfWork: OrderingUnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute({ actor, orderId, reason }: CancelOrderCommand): Promise<void> {
    await this.unitOfWork.run(async ({ orders, recordEvent }) => {
      const order = await orders.findById(actor.hotelId, orderId);
      if (!order) throw new NotFoundError('Order');

      const now = this.clock.now();
      const change = order.cancel(reason, now);

      await orders.saveStatusChange(order, change, { userId: actor.id, name: actor.fullName });
      await recordEvent(orderStatusChanged(order, change, actorOf(actor), now, reason));
    });
  }
}
