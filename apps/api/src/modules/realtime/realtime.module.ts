import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/utils/clock.js';
import type { EventBus } from '../../shared/events/event-bus.js';
import { StaffConnections } from './application/staff-connections.js';
import { registerStaffGateway, type StaffGatewayDeps } from './interface/staff-gateway.js';
import { subscribeStaffDashboards } from './interface/subscribers/push-to-staff.subscriber.js';

export interface RealtimeModuleDeps {
  bus: EventBus;
  clock: Clock;
  staffFromAccessToken: StaffGatewayDeps['staffFromAccessToken'];
}

export function createRealtimeModule({ bus, clock, staffFromAccessToken }: RealtimeModuleDeps) {
  const connections = new StaffConnections();
  subscribeStaffDashboards(bus, connections);

  return {
    /** Registered at the root, not under /api/v1. */
    registerRoutes(app: FastifyInstance) {
      registerStaffGateway(app, { connections, clock, staffFromAccessToken });
    },
  };
}

export type RealtimeModule = ReturnType<typeof createRealtimeModule>;
