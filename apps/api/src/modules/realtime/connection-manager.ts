/**
 * ConnectionManager maintains the registry of active WebSocket connections,
 * mapped by identity (guest session, staff account, hotel tenant) and subscribable
 * real-time broadcast channels.
 *
 * Implements a 30-second ping/pong heartbeat protocol to detect and terminate
 * dead or unresponsive connections, purging all channel subscriptions and
 * associated state from memory to guarantee zero memory leaks.
 */

export interface SocketLike {
  readyState?: number;
  send(data: string, cb?: (err?: Error) => void): void;
  close(code?: number, reason?: string): void;
  terminate?(): void;
  ping?(data?: unknown, mask?: boolean, cb?: (err?: Error) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
}

export type ClientType = 'guest' | 'staff' | string;

export interface BaseConnectionMetadata {
  clientType: ClientType;
  hotelId: string;
  channels?: string[];
  [key: string]: unknown;
}

export interface GuestConnectionMetadata extends BaseConnectionMetadata {
  clientType: 'guest';
  sessionId: string;
  roomId: string;
  roomNumber?: string;
  stayId: string;
  guestName?: string;
}

export interface StaffConnectionMetadata extends BaseConnectionMetadata {
  clientType: 'staff';
  userId: string;
  role?: string;
}

export type ConnectionMetadata = GuestConnectionMetadata | StaffConnectionMetadata | BaseConnectionMetadata;

export interface ConnectionManagerOptions {
  /** Heartbeat check interval in milliseconds. Defaults to 30,000 (30 seconds). */
  heartbeatIntervalMs?: number;
  /** Whether to automatically start the heartbeat timer upon instantiation. Defaults to false. */
  autoStartHeartbeat?: boolean;
}

export class ConnectionManager {
  private readonly socketToMetadata = new Map<SocketLike, ConnectionMetadata>();
  private readonly socketToChannels = new Map<SocketLike, Set<string>>();
  private readonly channelToSockets = new Map<string, Set<SocketLike>>();
  private readonly aliveSockets = new Set<SocketLike>();
  private readonly socketCleanupHandlers = new Map<SocketLike, () => void>();

  private heartbeatTimer?: NodeJS.Timeout;
  private heartbeatIntervalMs: number;

  constructor(options: ConnectionManagerOptions = {}) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
    if (options.autoStartHeartbeat) {
      this.startHeartbeat();
    }
  }

  /**
   * Registers an active WebSocket connection with its client identity metadata.
   * Automatically subscribes the socket to its default channels based on identity.
   * Returns an unregister cleanup function.
   */
  register(socket: SocketLike, metadata: ConnectionMetadata): () => void {
    // If the socket was already registered, unregister it first to reset state cleanly
    if (this.socketToMetadata.has(socket)) {
      this.unregister(socket);
    }

    this.socketToMetadata.set(socket, metadata);
    this.aliveSockets.add(socket);

    const initialChannels = new Set<string>();
    this.socketToChannels.set(socket, initialChannels);

    // Derive and subscribe to standard identity channels
    if (metadata.hotelId) {
      this.subscribe(socket, `hotel:${metadata.hotelId}`);
    }

    if (metadata.clientType === 'guest') {
      const guest = metadata as GuestConnectionMetadata;
      if (guest.sessionId) {
        this.subscribe(socket, `guest:${guest.sessionId}`);
        this.subscribe(socket, `session:${guest.sessionId}`);
      }
      if (guest.stayId) {
        this.subscribe(socket, `stay:${guest.stayId}`);
      }
      if (guest.roomId) {
        this.subscribe(socket, `room:${guest.hotelId}:${guest.roomId}`);
        this.subscribe(socket, `room:${guest.roomId}`);
      }
      if (guest.hotelId) {
        this.subscribe(socket, `hotel:${guest.hotelId}:guests`);
      }
    } else if (metadata.clientType === 'staff') {
      const staff = metadata as StaffConnectionMetadata;
      if (staff.userId) {
        this.subscribe(socket, `staff:${staff.userId}`);
        this.subscribe(socket, `user:${staff.userId}`);
      }
      if (staff.hotelId) {
        this.subscribe(socket, `hotel:${staff.hotelId}:staff`);
      }
    }

    // Subscribe to any custom channels provided in metadata
    if (Array.isArray(metadata.channels)) {
      for (const channel of metadata.channels) {
        if (channel && typeof channel === 'string') {
          this.subscribe(socket, channel);
        }
      }
    }

    // Attach heartbeat pong listener
    const onPong = () => {
      this.aliveSockets.add(socket);
    };

    // Attach close listener to ensure clean unregistration
    const onClose = () => {
      this.unregister(socket);
    };

    if (typeof socket.on === 'function') {
      socket.on('pong', onPong);
      socket.on('close', onClose);
    }

    this.socketCleanupHandlers.set(socket, () => {
      if (typeof socket.removeListener === 'function') {
        socket.removeListener('pong', onPong);
        socket.removeListener('close', onClose);
      } else if (typeof socket.off === 'function') {
        socket.off('pong', onPong);
        socket.off('close', onClose);
      }
    });

    return () => this.unregister(socket);
  }

  /**
   * Unregisters a WebSocket, terminating any lingering channel subscriptions,
   * purging associated memory, and removing event listeners.
   */
  unregister(socket: SocketLike): void {
    if (!this.socketToMetadata.has(socket)) {
      return;
    }

    // Remove event listeners
    const cleanup = this.socketCleanupHandlers.get(socket);
    if (cleanup) {
      cleanup();
      this.socketCleanupHandlers.delete(socket);
    }

    // Remove from heartbeat tracking
    this.aliveSockets.delete(socket);

    // Remove from all subscribed channels
    const channels = this.socketToChannels.get(socket);
    if (channels) {
      for (const channel of channels) {
        const socketSet = this.channelToSockets.get(channel);
        if (socketSet) {
          socketSet.delete(socket);
          if (socketSet.size === 0) {
            this.channelToSockets.delete(channel);
          }
        }
      }
      this.socketToChannels.delete(socket);
    }

    // Remove metadata
    this.socketToMetadata.delete(socket);
  }

  /**
   * Returns all active sockets subscribed to the given channel.
   */
  getSocketsByChannel(channel: string): SocketLike[] {
    const socketSet = this.channelToSockets.get(channel);
    if (!socketSet) {
      return [];
    }
    return Array.from(socketSet);
  }

  /**
   * Subscribes an active socket to an additional channel.
   */
  subscribe(socket: SocketLike, channel: string): void {
    if (!this.socketToMetadata.has(socket)) {
      return;
    }

    let channels = this.socketToChannels.get(socket);
    if (!channels) {
      channels = new Set();
      this.socketToChannels.set(socket, channels);
    }
    channels.add(channel);

    let socketSet = this.channelToSockets.get(channel);
    if (!socketSet) {
      socketSet = new Set();
      this.channelToSockets.set(channel, socketSet);
    }
    socketSet.add(socket);
  }

  /**
   * Unsubscribes an active socket from a specific channel.
   */
  unsubscribe(socket: SocketLike, channel: string): void {
    const channels = this.socketToChannels.get(socket);
    if (channels) {
      channels.delete(channel);
      if (channels.size === 0) {
        this.socketToChannels.delete(socket);
      }
    }

    const socketSet = this.channelToSockets.get(channel);
    if (socketSet) {
      socketSet.delete(socket);
      if (socketSet.size === 0) {
        this.channelToSockets.delete(channel);
      }
    }
  }

  /**
   * Retrieves connection metadata associated with a socket.
   */
  getMetadata(socket: SocketLike): ConnectionMetadata | undefined {
    return this.socketToMetadata.get(socket);
  }

  /**
   * Returns the count of registered active sockets.
   */
  getActiveConnectionCount(): number {
    return this.socketToMetadata.size;
  }

  /**
   * Returns the count of active channels with at least one subscriber.
   */
  getChannelCount(): number {
    return this.channelToSockets.size;
  }

  /**
   * Broadcasts a JSON-serializable message to all sockets subscribed to the specified channel.
   */
  broadcast(channel: string, message: unknown): void {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    const sockets = this.getSocketsByChannel(channel);

    for (const socket of sockets) {
      try {
        socket.send(payload);
      } catch {
        // Socket failed during send; terminate and unregister immediately
        try {
          if (typeof socket.terminate === 'function') {
            socket.terminate();
          } else {
            socket.close(1006, 'Send failed');
          }
        } catch {
          // ignore
        }
        this.unregister(socket);
      }
    }
  }

  /**
   * Sweeps all connections:
   * - Connections that failed to answer the prior ping (isAlive is false) are terminated and purged.
   * - Connections that answered have isAlive reset to false and are issued a new ping.
   */
  checkHeartbeats(): void {
    const sockets = Array.from(this.socketToMetadata.keys());

    for (const socket of sockets) {
      if (!this.aliveSockets.has(socket)) {
        // Did not answer the ping within the window: dead connection
        try {
          if (typeof socket.terminate === 'function') {
            socket.terminate();
          } else {
            socket.close(1006, 'Ping timeout');
          }
        } catch {
          // ignore error
        }
        this.unregister(socket);
      } else {
        // Answered: mark as awaiting pong and send next ping
        this.aliveSockets.delete(socket);
        try {
          if (typeof socket.ping === 'function') {
            socket.ping();
          }
        } catch {
          try {
            if (typeof socket.terminate === 'function') {
              socket.terminate();
            } else {
              socket.close(1006, 'Ping failed');
            }
          } catch {
            // ignore
          }
          this.unregister(socket);
        }
      }
    }
  }

  /**
   * Starts the recurring heartbeat check.
   */
  startHeartbeat(intervalMs: number = this.heartbeatIntervalMs): void {
    this.stopHeartbeat();
    this.heartbeatIntervalMs = intervalMs;
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, this.heartbeatIntervalMs);

    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Stops the recurring heartbeat check.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Destroys the connection manager: stops timers, terminates all active connections,
   * and clears all state.
   */
  destroy(): void {
    this.stopHeartbeat();
    const sockets = Array.from(this.socketToMetadata.keys());
    for (const socket of sockets) {
      try {
        if (typeof socket.terminate === 'function') {
          socket.terminate();
        } else {
          socket.close(1001, 'Server shutting down');
        }
      } catch {
        // ignore
      }
      this.unregister(socket);
    }

    this.socketToMetadata.clear();
    this.socketToChannels.clear();
    this.channelToSockets.clear();
    this.aliveSockets.clear();
    this.socketCleanupHandlers.clear();
  }
}
