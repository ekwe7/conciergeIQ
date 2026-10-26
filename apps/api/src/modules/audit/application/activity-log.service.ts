import type { ActivityEntry, DomainEvent, ListActivityQuery } from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import { actorName, describeEvent } from '../domain/describe-event.js';
import { ActivityLogRepository } from '../infrastructure/activity-log.repository.js';
import type { ActivityLogRow } from '../infrastructure/audit.schema.js';

function toActivityEntry(row: ActivityLogRow): ActivityEntry {
  return {
    id: row.id,
    eventName: row.eventName,
    category: row.category,
    detail: row.detail,
    actorName: row.actorName,
    occurredAt: row.occurredAt.toISOString(),
  };
}

export class ActivityLogService {
  constructor(private readonly db: Database) {}

  async record(event: DomainEvent, eventId: string): Promise<void> {
    const { category, detail } = describeEvent(event);
    await new ActivityLogRepository(this.db).append({
      eventId,
      hotelId: event.hotelId,
      eventName: event.eventName,
      category,
      detail,
      actorId: event.actor.type === 'staff' ? event.actor.id : null,
      actorName: actorName(event.actor),
      occurredAt: new Date(event.occurredAt),
    });
  }

  async list(hotelId: string, query: ListActivityQuery): Promise<ActivityEntry[]> {
    const rows = await new ActivityLogRepository(this.db).list(hotelId, query);
    return rows.map(toActivityEntry);
  }
}
