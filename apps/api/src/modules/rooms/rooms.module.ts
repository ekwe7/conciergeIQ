import type { FastifyInstance } from 'fastify';
import type { Database } from '../../shared/db/client.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { Outbox } from '../../shared/events/outbox.repository.js';
import type { AuthGuards } from '../identity/index.js';
import { RoomsService } from './application/rooms.service.js';
import { registerRoomsRoutes } from './interface/http/rooms.routes.js';

export interface RoomsModuleDeps {
  db: Database;
  outbox: Outbox;
  clock: Clock;
  guards: AuthGuards;
  guestAppUrl: string;
  hotelNameOf(hotelId: string): Promise<string>;
}

export function createRoomsModule(deps: RoomsModuleDeps) {
  const rooms = new RoomsService(deps.db, deps.outbox, deps.clock, deps.guestAppUrl);

  return {
    rooms,
    registerRoutes(api: FastifyInstance) {
      registerRoomsRoutes(api, { rooms, guards: deps.guards, hotelNameOf: deps.hotelNameOf });
    },
  };
}

export type RoomsModule = ReturnType<typeof createRoomsModule>;
