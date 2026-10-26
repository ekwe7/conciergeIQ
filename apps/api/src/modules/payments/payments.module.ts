import type { FastifyInstance } from 'fastify';
import type { Database } from '../../shared/db/client.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { Outbox } from '../../shared/events/outbox.repository.js';
import type { AuthGuards } from '../identity/index.js';
import type { OrderReadModel } from '../ordering/index.js';
import { PaymentsService } from './application/payments.service.js';
import { registerPaymentsRoutes } from './interface/http/payments.routes.js';

export interface PaymentsModuleDeps {
  db: Database;
  outbox: Outbox;
  clock: Clock;
  guards: AuthGuards;
  orders: Pick<OrderReadModel, 'findPaymentFacts' | 'listDeliveredUnpaid'>;
}

export function createPaymentsModule({ db, outbox, clock, guards, orders }: PaymentsModuleDeps) {
  const payments = new PaymentsService(db, outbox, clock, orders);

  return {
    payments,
    registerRoutes(api: FastifyInstance) {
      registerPaymentsRoutes(api, payments, guards);
    },
  };
}

export type PaymentsModule = ReturnType<typeof createPaymentsModule>;
