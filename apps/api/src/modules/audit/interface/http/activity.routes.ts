import { ListActivityQuerySchema, type ActivityEntry } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { ActivityLogService } from '../../application/activity-log.service.js';

export function registerActivityRoutes(app: FastifyInstance, activity: ActivityLogService, guards: AuthGuards): void {
  const canView = {
    schema: { tags: ['Activity log'] },
    preHandler: guards.requirePermission(Permission.VIEW_ACTIVITY_LOG),
  };

  app.get('/activity', canView, async (request) => {
    return activity.list(request.staff.hotelId, parseInput(ListActivityQuerySchema, request.query));
  });

  app.get('/activity.csv', canView, async (request, reply) => {
    const entries = await activity.list(request.staff.hotelId, parseInput(ListActivityQuerySchema, request.query));
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="activity-log.csv"')
      .send(toCsv(entries));
  });
}

function toCsv(entries: ActivityEntry[]): string {
  const header = ['Time', 'Event', 'Detail', 'Actor'];
  const rows = entries.map((entry) => [entry.occurredAt, entry.eventName, entry.detail, entry.actorName]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
