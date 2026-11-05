// Public API of the realtime module. Other modules import from this file only.
export { createRealtimeModule, type RealtimeModule, type RealtimeModuleDeps } from './realtime.module.js';
export { UNAUTHORIZED_CLOSE_CODE, registerStaffGateway, type StaffGatewayDeps } from './interface/staff-gateway.js';
export { registerGuestGateway, type GuestGatewayDeps } from './interface/guest-gateway.js';
export {
  ConnectionManager,
  type ConnectionManagerOptions,
  type ConnectionMetadata,
  type GuestConnectionMetadata,
  type StaffConnectionMetadata,
  type SocketLike,
} from './connection-manager.js';
export { ChannelAuthorizer } from './channel-authorizer.js';
export {
  EventReplayBuffer,
  type EventReplayBufferOptions,
  type ReplayableEvent,
  type RecordEventOptions,
} from './event-replay-buffer.js';
export {
  RealtimeEventDispatcher,
  type RealtimeEventDispatcherDeps,
} from './realtime-event-dispatcher.js';
export { realtimeWebSocketPlugin, type RealtimeWebSocketPluginOptions } from './websocket.plugin.js';
export { StaffConnections, type StaffSocket } from './application/staff-connections.js';
