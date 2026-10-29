/**
 * WHAT IT DOES:
 * Re-exports and registers guest-facing ordering routes, including guest menu browsing.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Centralizes guest-facing HTTP route entry points within the `interface/http` directory.
 * - Arrow functions and descriptive variable names are used throughout.
 */

export {
  registerGuestMenuRoutes,
  type GuestMenuRoutesDeps,
} from '../guest-menu.controller.js';
