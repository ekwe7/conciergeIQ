/** Who caused an event. Shown in the activity log. */
export type EventActor =
  | { type: 'staff'; id: string; name: string }
  | { type: 'guest'; roomNumber: string }
  | { type: 'system' };

/** Fields every domain event carries. */
export interface EventBase {
  hotelId: string;
  occurredAt: string;
  actor: EventActor;
}
