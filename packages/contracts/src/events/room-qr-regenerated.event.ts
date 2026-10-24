import type { EventBase } from './event-base.js';

export interface RoomQrRegeneratedEvent extends EventBase {
  eventName: 'room.qr_regenerated';
  roomId: string;
  roomNumber: string;
}
