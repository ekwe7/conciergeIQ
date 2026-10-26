import type { FastifyInstance } from 'fastify';
import type { Database } from '../../shared/db/client.js';
import type { EventBus } from '../../shared/events/event-bus.js';
import type { AuthGuards } from '../identity/index.js';
import { ActivityLogService } from './application/activity-log.service.js';
import { registerActivityRoutes } from './interface/http/activity.routes.js';
import { subscribeToAllEvents } from './interface/subscribers/record-activity.subscriber.js';

export function createAuditModule({ db, bus, guards }: { db: Database; bus: EventBus; guards: AuthGuards }) {
  const activity = new ActivityLogService(db);
  subscribeToAllEvents(bus, activity);

  return {
    activity,
    registerRoutes(api: FastifyInstance) {
      registerActivityRoutes(api, activity, guards);
    },
  };
}

export type AuditModule = ReturnType<typeof createAuditModule>;
