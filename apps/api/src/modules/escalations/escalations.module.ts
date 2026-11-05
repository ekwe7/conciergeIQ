import type { FastifyInstance } from 'fastify';
import type { Database } from '../../shared/db/client.js';
import type { Outbox } from '../../shared/events/outbox.repository.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { AuthGuards } from '../identity/index.js';
import type { OrderReadModel } from '../ordering/index.js';
import { EscalationService } from './application/escalation.service.js';
import type { Notifier } from './application/notifier.port.js';
import { registerEscalationsRoutes } from './interface/http/escalations.routes.js';

export interface EscalationsModuleDeps {
  db: Database;
  outbox: Outbox;
  clock: Clock;
  guards: AuthGuards;
  notifier: Notifier;
  orders: Pick<OrderReadModel, 'listWaiting' | 'acceptanceOf'>;
  hotelNameOf(hotelId: string): Promise<string>;
  dashboardUrl: string;
  log: EscalationServiceLog;
}

type EscalationServiceLog = { warn(details: object, message: string): void; error(details: object, message: string): void };

export function createEscalationsModule(deps: EscalationsModuleDeps) {
  const escalations = new EscalationService(deps);
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    escalations,
    registerRoutes(api: FastifyInstance) {
      registerEscalationsRoutes(api, escalations, deps.guards);
    },
    /** Checks for overdue orders every `intervalMs`. */
    start(intervalMs: number) {
      timer ??= setInterval(() => {
        escalations.sweep().catch((error: unknown) => deps.log.error({ err: error }, 'Escalation sweep failed'));
      }, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

export type EscalationsModule = ReturnType<typeof createEscalationsModule>;
