/**
 * WHAT IT DOES:
 * Re-exports the SubscriberRegistry class and related handler types.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Provides a clean, dedicated import path for the subscriber registry abstraction.
 */
export { SubscriberRegistry, type EventHandler, type EventDelivery } from './event-bus.js';
