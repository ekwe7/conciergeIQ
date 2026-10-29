import fastifyWebsocket, { type WebsocketPluginOptions } from '@fastify/websocket';
import type { FastifyPluginAsync } from 'fastify';
import { ConnectionManager, type ConnectionManagerOptions } from './connection-manager.js';

export interface RealtimeWebSocketPluginOptions {
  connectionManager?: ConnectionManager;
  connectionManagerOptions?: ConnectionManagerOptions;
  websocketOptions?: WebsocketPluginOptions;
}

declare module 'fastify' {
  interface FastifyInstance {
    connectionManager: ConnectionManager;
  }
}

/**
 * Fastify plugin registering @fastify/websocket and decorating Fastify with
 * a centralized ConnectionManager instance for real-time connection lifecycle management.
 */
export const realtimeWebSocketPlugin: FastifyPluginAsync<RealtimeWebSocketPluginOptions> = async (
  fastify,
  opts = {}
) => {
  if (!fastify.hasDecorator('websocketServer')) {
    await fastify.register(fastifyWebsocket, opts.websocketOptions);
  }

  const connectionManager =
    opts.connectionManager ??
    (fastify.hasDecorator('connectionManager')
      ? fastify.connectionManager
      : new ConnectionManager({
          autoStartHeartbeat: true,
          ...opts.connectionManagerOptions,
        }));

  if (!fastify.hasDecorator('connectionManager')) {
    fastify.decorate('connectionManager', connectionManager);
  }

  fastify.addHook('onClose', async () => {
    connectionManager.destroy();
  });
};

(realtimeWebSocketPlugin as unknown as { [key: symbol]: boolean })[Symbol.for('skip-override')] = true;

export default realtimeWebSocketPlugin;
