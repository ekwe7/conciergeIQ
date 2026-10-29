import type { FastifyInstance } from 'fastify';
import type { Database } from '../../shared/db/client.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { EventBus } from '../../shared/events/event-bus.js';
import type { Outbox } from '../../shared/events/outbox.repository.js';
import type { AuthGuards } from '../identity/index.js';
import type { MenuModule } from '../menu/index.js';
import { AdvanceOrderUseCase } from './application/use-cases/advance-order.use-case.js';
import { CancelOrderUseCase } from './application/use-cases/cancel-order.use-case.js';
import { GetGuestMenuUseCase } from './application/use-cases/get-guest-menu.use-case.js';
import { GetGuestOrdersUseCase } from './application/use-cases/get-guest-orders.use-case.js';
import { ListHotelOrdersUseCase } from './application/use-cases/list-hotel-orders.use-case.js';
import { PlaceOrderUseCase } from './application/use-cases/place-order.use-case.js';
import { DrizzleOrderingUnitOfWork } from './infrastructure/drizzle-ordering-unit-of-work.js';
import { MenuCatalogAdapter } from './infrastructure/menu-catalog.adapter.js';
import { MenuLookupAdapter } from './infrastructure/menu-lookup.adapter.js';
import { OrderQueries } from './infrastructure/order-queries.js';
import { registerGuestMenuRoutes } from './interface/guest-menu.controller.js';
import { registerGuestOrderQueryRoutes } from './interface/guest-order-query.controller.js';
import { registerGuestOrdersRoutes } from './interface/guest-orders.controller.js';
import { registerStaffOrdersRoutes } from './interface/http/staff-orders.routes.js';
import { subscribeToPayments } from './interface/subscribers/mark-order-paid.subscriber.js';

export interface OrderingModuleDeps {
  db: Database;
  outbox: Outbox;
  bus: EventBus;
  clock: Clock;
  guards: AuthGuards;
  menuModule: Pick<MenuModule, 'menu'>;
}

export function createOrderingModule({ db, outbox, bus, clock, guards, menuModule }: OrderingModuleDeps) {
  const unitOfWork = new DrizzleOrderingUnitOfWork(db, outbox);
  const orders = new OrderQueries(db);

  const placeOrder = new PlaceOrderUseCase(unitOfWork, new MenuLookupAdapter(menuModule), clock);
  const listHotelOrders = new ListHotelOrdersUseCase(orders, clock);
  const advanceOrder = new AdvanceOrderUseCase(unitOfWork, clock);
  const cancelOrder = new CancelOrderUseCase(unitOfWork, clock);
  const getGuestMenu = new GetGuestMenuUseCase(new MenuCatalogAdapter(menuModule));
  const getGuestOrders = new GetGuestOrdersUseCase(orders);

  subscribeToPayments(bus, db);

  return {
    placeOrder,
    advanceOrder,
    cancelOrder,
    getGuestMenu,
    getGuestOrders,
    orders,
    registerRoutes(api: FastifyInstance) {
      registerStaffOrdersRoutes(api, { guards, orders, listHotelOrders, advanceOrder, cancelOrder });
      registerGuestMenuRoutes(api, { getGuestMenuUseCase: getGuestMenu });
      registerGuestOrdersRoutes(api, { placeOrderUseCase: placeOrder });
      registerGuestOrderQueryRoutes(api, { getGuestOrdersUseCase: getGuestOrders });
    },
  };
}

export type OrderingModule = ReturnType<typeof createOrderingModule>;
