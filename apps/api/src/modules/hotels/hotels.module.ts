import type { FastifyInstance } from 'fastify';
import type { Database } from '../../shared/db/client.js';
import type { AuthGuards } from '../identity/index.js';
import { HotelsService } from './application/hotels.service.js';
import { registerHotelRoutes } from './interface/http/hotel.routes.js';

export function createHotelsModule({ db, guards }: { db: Database; guards: AuthGuards }) {
  const hotels = new HotelsService(db);

  return {
    hotels,
    registerRoutes(api: FastifyInstance) {
      registerHotelRoutes(api, hotels, guards);
    },
  };
}

export type HotelsModule = ReturnType<typeof createHotelsModule>;
