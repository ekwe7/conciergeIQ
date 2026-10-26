// Public API of the ordering module. Other modules import from this file only.
export { createOrderingModule, type OrderingModule } from './ordering.module.js';
export type { PlaceOrderCommand } from './application/use-cases/place-order.use-case.js';
export type {
  OrderPaymentFacts,
  OrderReadModel,
  StayOrdersSummary,
} from './application/ports/order-read-model.port.js';
