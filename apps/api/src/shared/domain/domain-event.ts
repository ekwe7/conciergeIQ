export interface DomainEvent{
    readonly eventId: string;
    readonly occurredOn: Date;
    readonly eventName: string;
}