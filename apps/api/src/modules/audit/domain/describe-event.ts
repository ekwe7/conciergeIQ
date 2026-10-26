import {
  ActivityCategory,
  formatOrderNumber,
  type DomainEvent,
  type EventActor,
} from '@conciergeiq/contracts';

export interface ActivityDescription {
  category: ActivityCategory;
  /** One line for the activity log, for example "A-1042 → IN_PROGRESS". */
  detail: string;
}

const naira = (amount: number) => `₦${amount.toLocaleString('en-NG')}`;

export function describeEvent(event: DomainEvent): ActivityDescription {
  switch (event.eventName) {
    case 'order.created':
      return {
        category: ActivityCategory.ORDERS,
        detail: `${formatOrderNumber(event.orderNumber)} · Room ${event.roomNumber} · ${naira(event.totalAmount)}`,
      };
    case 'order.status_changed': {
      const reason = event.reason ? ` · ${event.reason}` : '';
      return {
        category: ActivityCategory.ORDERS,
        detail: `${formatOrderNumber(event.orderNumber)} → ${event.newStatus}${reason}`,
      };
    }
    case 'payment.recorded':
      return {
        category: ActivityCategory.PAYMENTS,
        detail: `${formatOrderNumber(event.orderNumber)} · ${naira(event.amount)} · ${capitalize(event.method)}`,
      };
    case 'item.availability_changed':
      return {
        category: ActivityCategory.MENU,
        detail: `${event.itemName} → ${event.isAvailable ? 'available' : 'unavailable'}`,
      };
    case 'stay.checked_in':
    case 'stay.checked_out':
      return { category: ActivityCategory.STAYS, detail: `Room ${event.roomNumber} · ${event.guestName}` };
    case 'guest_session.invalidated':
      return { category: ActivityCategory.STAYS, detail: `Room ${event.roomNumber} · guest session closed` };
    case 'user.deactivated':
      return { category: ActivityCategory.STAFF, detail: event.userName };
    case 'room.qr_regenerated':
      return { category: ActivityCategory.ROOMS, detail: `Room ${event.roomNumber}` };
  }
}

export function actorName(actor: EventActor): string {
  switch (actor.type) {
    case 'staff':
      return actor.name;
    case 'guest':
      return `Guest · Room ${actor.roomNumber}`;
    case 'system':
      return 'System';
  }
}

function capitalize(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}
