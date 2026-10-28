/**
 * WHAT IT DOES:
 * Re-exports the in-memory EventBus class and types.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Provides an explicit entry point for the in-memory event bus implementation.
 */
export { EventBus as InMemoryEventBus, EventBus, type EventHandler, type EventDelivery } from './event-bus.js';
