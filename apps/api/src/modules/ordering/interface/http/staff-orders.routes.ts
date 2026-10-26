import { ListOrdersQuerySchema, OrderStatus, UpdateOrderStatusSchema } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotFoundError } from '../../../../shared/errors/app-error.js';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { OrderReadModel } from '../../application/ports/order-read-model.port.js';
import type { AdvanceOrderUseCase } from '../../application/use-cases/advance-order.use-case.js';
import type { CancelOrderUseCase } from '../../application/use-cases/cancel-order.use-case.js';
import type { ListHotelOrdersUseCase } from '../../application/use-cases/list-hotel-orders.use-case.js';

const OrderParamsSchema = z.object({ orderId: z.string().uuid() });

export interface StaffOrdersRoutesDeps {
  guards: AuthGuards;
  orders: OrderReadModel;
  listHotelOrders: ListHotelOrdersUseCase;
  advanceOrder: AdvanceOrderUseCase;
  cancelOrder: CancelOrderUseCase;
}

/** The live orders board: list, open, accept, deliver and cancel. */
export function registerStaffOrdersRoutes(app: FastifyInstance, deps: StaffOrdersRoutesDeps): void {
  const canWorkOrders = {
    schema: { tags: ['Orders'] },
    preHandler: deps.guards.requirePermission(Permission.VIEW_AND_UPDATE_ORDERS),
  };

  app.get('/orders', canWorkOrders, async (request) => {
    const { status, since } = parseInput(ListOrdersQuerySchema, request.query);
    return deps.listHotelOrders.execute({
      hotelId: request.staff.hotelId,
      status,
      since: since ? new Date(since) : undefined,
    });
  });

  app.get('/orders/:orderId', canWorkOrders, async (request) => {
    const { orderId } = parseInput(OrderParamsSchema, request.params);
    const order = await deps.orders.get(request.staff.hotelId, orderId);
    if (!order) throw new NotFoundError('Order');
    return order;
  });

  app.patch('/orders/:orderId/status', canWorkOrders, async (request) => {
    const { orderId } = parseInput(OrderParamsSchema, request.params);
    const { status, reason } = parseInput(UpdateOrderStatusSchema, request.body);

    if (status === OrderStatus.CANCELLED) {
      await deps.cancelOrder.execute({ actor: request.staff, orderId, reason: reason! });
    } else {
      await deps.advanceOrder.execute({ actor: request.staff, orderId, toStatus: status });
    }
    return deps.orders.get(request.staff.hotelId, orderId);
  });
}
