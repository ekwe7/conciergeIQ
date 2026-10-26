import type { FastifyInstance } from 'fastify';
import type { Database } from '../../shared/db/client.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { Outbox } from '../../shared/events/outbox.repository.js';
import type { AuthGuards } from '../identity/index.js';
import { MenuService } from './application/menu.service.js';
import { registerMenuRoutes } from './interface/http/menu.routes.js';

export interface MenuModuleDeps {
  db: Database;
  outbox: Outbox;
  clock: Clock;
  guards: AuthGuards;
}

export function createMenuModule({ db, outbox, clock, guards }: MenuModuleDeps) {
  const menu = new MenuService(db, outbox, clock);

  return {
    menu,
    registerRoutes(api: FastifyInstance) {
      registerMenuRoutes(api, menu, guards);
    },
  };
}

export type MenuModule = ReturnType<typeof createMenuModule>;
