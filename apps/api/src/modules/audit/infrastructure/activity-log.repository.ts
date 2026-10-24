import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { ListActivityQuery } from '@conciergeiq/contracts';
import type { DbExecutor } from '../../../shared/db/client.js';
import { activityLog, type ActivityLogRow, type NewActivityLogRow } from './audit.schema.js';

export class ActivityLogRepository {
  constructor(private readonly db: DbExecutor) {}

  async append(entry: NewActivityLogRow): Promise<void> {
    await this.db.insert(activityLog).values(entry).onConflictDoNothing({ target: activityLog.eventId });
  }

  async list(hotelId: string, query: ListActivityQuery): Promise<ActivityLogRow[]> {
    const conditions = [eq(activityLog.hotelId, hotelId)];
    if (query.category) conditions.push(eq(activityLog.category, query.category));
    if (query.actorId) conditions.push(eq(activityLog.actorId, query.actorId));
    if (query.from) conditions.push(gte(activityLog.occurredAt, new Date(query.from)));
    if (query.to) conditions.push(lte(activityLog.occurredAt, new Date(query.to)));

    return this.db
      .select()
      .from(activityLog)
      .where(and(...conditions))
      .orderBy(desc(activityLog.occurredAt))
      .limit(query.limit);
  }
}
