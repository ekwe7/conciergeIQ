import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/utils/clock.js';
import type { EventBus } from '../../shared/events/event-bus.js';
import { ConnectionManager } from './connection-manager.js';
import { StaffConnections } from './application/staff-connections.js';
import { registerStaffGateway, type StaffGatewayDeps } from './interface/staff-gateway.js';
import { registerGuestGateway } from './interface/guest-gateway.js';
import { subscribeStaffDashboards } from './interface/subscribers/push-to-staff.subscriber.js';

export interface RealtimeModuleDeps {
  bus: EventBus;
  clock: Clock;
  staffFromAccessToken: StaffGatewayDeps['staffFromAccessToken'];
  connectionManager?: ConnectionManager;
}

export function createRealtimeModule({ bus, clock, staffFromAccessToken, connectionManager: providedManager }: RealtimeModuleDeps) {
  const connectionManager = providedManager ?? new ConnectionManager({ autoStartHeartbeat: true });
  const connections = new StaffConnections(connectionManager);
  subscribeStaffDashboards(bus, connections);

  return {
    connectionManager,
    connections,
    /** Registered at the root, not under /api/v1. */
    registerRoutes(app: FastifyInstance) {
      registerStaffGateway(app, { connections, clock, staffFromAccessToken });
      registerGuestGateway(app, { connectionManager, clock });
    },
  };
}

export type RealtimeModule = ReturnType<typeof createRealtimeModule>;
