/**
 * Sequenced event entry stored in the replay log.
 */
export interface ReplayableEvent<T = unknown> {
  eventId: string;
  channel: string;
  hotelId: string;
  roomId?: string;
  eventName: string;
  data: T;
  timestamp: string;
  sequence: number;
}

export interface RecordEventOptions<T = unknown> {
  channel: string;
  eventId?: string;
  eventName: string;
  data: T;
  hotelId: string;
  roomId?: string;
  timestamp?: string;
}

export interface EventReplayBufferOptions {
  /** Maximum number of events to retain per channel. Defaults to 500. */
  maxEventsPerChannel?: number;
  /** Maximum total events retained across all channels. Defaults to 10,000. */
  maxTotalEvents?: number;
}

/**
 * EventReplayBuffer maintains an in-memory chronological sequence log of real-time events.
 *
 * Allows clients reconnecting after brief network drops (screen locks, Wi-Fi switching)
 * to provide a `Last-Event-ID` and replay any missed events in strict chronological order.
 */
export class EventReplayBuffer {
  private sequenceCounter = 0;
  private readonly allEvents: ReplayableEvent[] = [];
  private readonly channelEvents = new Map<string, ReplayableEvent[]>();
  private readonly maxEventsPerChannel: number;
  private readonly maxTotalEvents: number;

  constructor(options: EventReplayBufferOptions = {}) {
    this.maxEventsPerChannel = options.maxEventsPerChannel ?? 500;
    this.maxTotalEvents = options.maxTotalEvents ?? 10_000;
  }

  /**
   * Records a new outbound event into the channel log and global sequence log.
   */
  record<T = unknown>(options: RecordEventOptions<T>): ReplayableEvent<T> {
    this.sequenceCounter++;
    const sequence = this.sequenceCounter;
    const eventId = options.eventId ?? `evt-${sequence}`;
    const timestamp = options.timestamp ?? new Date().toISOString();

    const entry: ReplayableEvent<T> = {
      eventId,
      channel: options.channel,
      hotelId: options.hotelId,
      roomId: options.roomId,
      eventName: options.eventName,
      data: options.data,
      timestamp,
      sequence,
    };

    // 1. Append to global sequence
    this.allEvents.push(entry as ReplayableEvent<unknown>);
    if (this.allEvents.length > this.maxTotalEvents) {
      this.allEvents.shift();
    }

    // 2. Append to channel log
    let list = this.channelEvents.get(options.channel);
    if (!list) {
      list = [];
      this.channelEvents.set(options.channel, list);
    }
    list.push(entry as ReplayableEvent<unknown>);
    if (list.length > this.maxEventsPerChannel) {
      list.shift();
    }

    return entry;
  }

  /**
   * Returns all missed events for a specific channel recorded after `lastEventId`,
   * ordered chronologically by sequence.
   */
  getMissedEvents(channel: string, lastEventId: string): ReplayableEvent[] {
    const list = this.channelEvents.get(channel);
    if (!list || list.length === 0) {
      return [];
    }

    if (!lastEventId) {
      return [...list];
    }

    // Find the index of the last acknowledged event
    const lastIndex = list.findIndex((e) => e.eventId === lastEventId);
    if (lastIndex === -1) {
      // If the lastEventId is not found (client has unknown or very old ID),
      // check if sequence is embedded (e.g. evt-4)
      const parsedSeq = this.parseSequence(lastEventId);
      if (parsedSeq !== undefined) {
        return list.filter((e) => e.sequence > parsedSeq);
      }
      // Otherwise return all available events to ensure no data is lost
      return [...list];
    }

    // Return everything recorded after the acknowledged event
    return list.slice(lastIndex + 1);
  }

  /**
   * Returns all missed events across multiple subscribed channels recorded after `lastEventId`,
   * de-duplicated and sorted chronologically.
   */
  getMissedEventsForChannels(channels: string[], lastEventId: string): ReplayableEvent[] {
    const seenEventIds = new Set<string>();
    const missedEvents: ReplayableEvent[] = [];

    for (const channel of channels) {
      const channelMissed = this.getMissedEvents(channel, lastEventId);
      for (const event of channelMissed) {
        if (!seenEventIds.has(event.eventId)) {
          seenEventIds.add(event.eventId);
          missedEvents.push(event);
        }
      }
    }

    // Sort chronologically by sequence
    return missedEvents.sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * Clears the replay buffer.
   */
  clear(): void {
    this.allEvents.length = 0;
    this.channelEvents.clear();
  }

  /**
   * Total count of events currently buffered across all channels.
   */
  size(): number {
    return this.allEvents.length;
  }

  private parseSequence(eventId: string): number | undefined {
    if (eventId.startsWith('evt-')) {
      const numStr = eventId.split('-')[1];
      const parsed = Number(numStr);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }
}
