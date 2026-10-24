import type { EventBus } from '../../../../shared/events/event-bus.js';
import type { ActivityLogService } from '../../application/activity-log.service.js';

/** Every domain event becomes one line in the hotel's activity log. */
export function subscribeToAllEvents(bus: EventBus, activity: ActivityLogService): void {
  bus.subscribeToAll((event, { eventId }) => activity.record(event, eventId));
}
