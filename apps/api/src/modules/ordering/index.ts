// Public API of the ordering module. Other modules import from this file only.
export { createOrderingModule, type OrderingModule } from './ordering.module.js';
export type { PlaceOrderCommand } from './application/use-cases/place-order.use-case.js';
export type {
  OrderAcceptance,
  OrderPaymentFacts,
  OrderReadModel,
  StayOrdersSummary,
  WaitingOrder,
} from './application/ports/order-read-model.port.js';
