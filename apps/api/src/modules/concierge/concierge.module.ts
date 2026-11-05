import type { FastifyInstance } from 'fastify';
import type { AuthGuards } from '../identity/index.js';
import { ConciergeService, type ConciergeGuest, type ConciergeServiceDeps } from './application/concierge.service.js';
import { registerConciergeRoutes } from './interface/http/concierge.routes.js';

export interface ConciergeModuleDeps extends ConciergeServiceDeps {
  guards: AuthGuards;
  guestFromToken(token: string): Promise<ConciergeGuest | undefined>;
}

export function createConciergeModule(deps: ConciergeModuleDeps) {
  const concierge = new ConciergeService(deps);
  return {
    concierge,
    registerRoutes(api: FastifyInstance) {
      registerConciergeRoutes(api, { concierge, guards: deps.guards, guestFromToken: deps.guestFromToken });
    },
  };
}

export type ConciergeModule = ReturnType<typeof createConciergeModule>;
