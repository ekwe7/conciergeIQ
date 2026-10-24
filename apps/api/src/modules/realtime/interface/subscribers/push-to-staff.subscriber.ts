import type { EventBus } from '../../../../shared/events/event-bus.js';
import type { StaffConnections } from '../../application/staff-connections.js';
import { staffMessageForEvent } from '../../domain/staff-message-for-event.js';

export function subscribeStaffDashboards(bus: EventBus, connections: StaffConnections): void {
  bus.subscribeToAll((event) => {
    const message = staffMessageForEvent(event);
    if (message) connections.broadcast(event.hotelId, message);
  });

  bus.subscribe('user.deactivated', (event) => connections.revokeUser(event.hotelId, event.userId));
}
