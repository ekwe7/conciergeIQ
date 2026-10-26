import type { FastifyInstance } from 'fastify';
import type { Database } from '../../shared/db/client.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { Outbox } from '../../shared/events/outbox.repository.js';
import type { AuthGuards } from '../identity/index.js';
import { StaysService, type StaysDependencies } from './application/stays.service.js';
import { registerStaysRoutes } from './interface/http/stays.routes.js';

export interface StaysModuleDeps extends StaysDependencies {
  db: Database;
  outbox: Outbox;
  clock: Clock;
  guards: AuthGuards;
}

export function createStaysModule({ db, outbox, clock, guards, ...dependencies }: StaysModuleDeps) {
  const stays = new StaysService(db, outbox, clock, dependencies);

  return {
    stays,
    registerRoutes(api: FastifyInstance) {
      registerStaysRoutes(api, stays, guards);
    },
  };
}

export type StaysModule = ReturnType<typeof createStaysModule>;
