export interface DomainEvent {
  readonly eventName: string;
  readonly eventId?: string;
  readonly occurredOn?: Date;
  readonly occurredAt?: string;
  readonly hotelId?: string;
  readonly actor?: unknown;
}
