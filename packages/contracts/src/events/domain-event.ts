import type { GuestSessionInvalidatedEvent } from './guest-session-invalidated.event.js';
import type { ItemAvailabilityChangedEvent } from './item-availability-changed.event.js';
import type { OrderCreatedEvent } from './order-created.event.js';
import type { OrderStatusChangedEvent } from './order-status-changed.event.js';
import type { PaymentRecordedEvent } from './payment-recorded.event.js';
import type { RoomQrRegeneratedEvent } from './room-qr-regenerated.event.js';
import type { StayCheckedInEvent } from './stay-checked-in.event.js';
import type { StayCheckedOutEvent } from './stay-checked-out.event.js';
import type { UserDeactivatedEvent } from './user-deactivated.event.js';

export type DomainEvent =
  | OrderCreatedEvent
  | OrderStatusChangedEvent
  | PaymentRecordedEvent
  | ItemAvailabilityChangedEvent
  | StayCheckedInEvent
  | StayCheckedOutEvent
  | GuestSessionInvalidatedEvent
  | UserDeactivatedEvent
  | RoomQrRegeneratedEvent;

export type DomainEventName = DomainEvent['eventName'];

/** Narrows `DomainEvent` to the event with the given name. */
export type DomainEventOf<Name extends DomainEventName> = Extract<DomainEvent, { eventName: Name }>;
