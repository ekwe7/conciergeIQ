import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/utils/clock.js';
import type { EventBus } from '../../shared/events/event-bus.js';
import { ConnectionManager } from './connection-manager.js';
import { StaffConnections } from './application/staff-connections.js';
import { ChannelAuthorizer } from './channel-authorizer.js';
import { EventReplayBuffer } from './event-replay-buffer.js';
import { RealtimeEventDispatcher } from './realtime-event-dispatcher.js';
import { registerStaffGateway, type StaffGatewayDeps } from './interface/staff-gateway.js';
import { registerGuestGateway } from './interface/guest-gateway.js';

export interface RealtimeModuleDeps {
  bus: EventBus;
  clock: Clock;
  staffFromAccessToken: StaffGatewayDeps['staffFromAccessToken'];
  connectionManager?: ConnectionManager;
  channelAuthorizer?: ChannelAuthorizer;
  replayBuffer?: EventReplayBuffer;
}

export function createRealtimeModule({
  bus,
  clock,
  staffFromAccessToken,
  connectionManager: providedManager,
  channelAuthorizer: providedAuthorizer,
  replayBuffer: providedReplayBuffer,
}: RealtimeModuleDeps) {
  const connectionManager = providedManager ?? new ConnectionManager({ autoStartHeartbeat: true });
  const channelAuthorizer = providedAuthorizer ?? new ChannelAuthorizer();
  const replayBuffer = providedReplayBuffer ?? new EventReplayBuffer();
  const connections = new StaffConnections(connectionManager);

  const dispatcher = new RealtimeEventDispatcher({
    bus,
    connectionManager,
    replayBuffer,
    clock,
  });
  dispatcher.start();

  return {
    connectionManager,
    channelAuthorizer,
    replayBuffer,
    dispatcher,
    connections,
    /** Registered at the root, not under /api/v1. */
    registerRoutes(app: FastifyInstance) {
      registerStaffGateway(app, {
        connections,
        clock,
        staffFromAccessToken,
        channelAuthorizer,
        replayBuffer,
      });
      registerGuestGateway(app, {
        connectionManager,
        clock,
        channelAuthorizer,
        replayBuffer,
      });
    },
  };
}

export type RealtimeModule = ReturnType<typeof createRealtimeModule>;
