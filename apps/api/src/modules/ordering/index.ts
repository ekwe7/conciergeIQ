// Public API of the ordering module. Other modules import from this file only.
export { createOrderingModule, type OrderingModule } from './ordering.module.js';
export { GetGuestMenuUseCase, type GetGuestMenuQuery } from './application/use-cases/get-guest-menu.use-case.js';
export type {
  MenuCatalogPort,
  CatalogCategory,
  CatalogItem,
} from './application/ports/menu-catalog.port.js';
export {
  GuestMenuController,
  registerGuestMenuRoutes,
  type GuestMenuRoutesDeps,
} from './interface/guest-menu.controller.js';
export {
  GuestOrdersController,
  registerGuestOrdersRoutes,
  type GuestOrdersRoutesDeps,
} from './interface/guest-orders.controller.js';
export {
  GuestOrderQueryController,
  registerGuestOrderQueryRoutes,
  type GuestOrderQueryRoutesDeps,
} from './interface/guest-order-query.controller.js';
export {
  GetGuestOrdersUseCase,
  GetGuestOrderDetailUseCase,
  type GetGuestOrdersQuery,
  type GetGuestOrderDetailQuery,
} from './application/use-cases/get-guest-orders.use-case.js';
export {
  PlaceOrderUseCase,
  type PlaceOrderCommand,
} from './application/place-order.use-case.js';
export type {
  OrderPaymentFacts,
  OrderReadModel,
  StayOrdersSummary,
} from './application/ports/order-read-model.port.js';
