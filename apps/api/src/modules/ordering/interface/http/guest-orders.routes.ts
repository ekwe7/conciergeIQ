/**
 * WHAT IT DOES:
 * Re-exports and registers guest-facing ordering routes, including menu browsing,
 * order placement, and order query/tracking.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Centralizes guest-facing HTTP route entry points within the `interface/http` directory.
 * - Arrow functions and descriptive variable names are used throughout.
 */

export {
  registerGuestMenuRoutes,
  type GuestMenuRoutesDeps,
} from '../guest-menu.controller.js';

export {
  GuestOrdersController,
  registerGuestOrdersRoutes,
  type GuestOrdersRoutesDeps,
} from '../guest-orders.controller.js';

export {
  GuestOrderQueryController,
  registerGuestOrderQueryRoutes,
  type GuestOrderQueryRoutesDeps,
} from '../guest-order-query.controller.js';
