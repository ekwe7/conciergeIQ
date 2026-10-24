import type { CreateRoomInput, Room, UpdateRoomInput } from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import { isUniqueViolation } from '../../../shared/db/errors.js';
import type { Clock } from '../../../shared/utils/clock.js';
import type { Outbox } from '../../../shared/events/outbox.repository.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { actorOf, type SignedInStaff } from '../../identity/index.js';
import { generateQrToken } from '../domain/qr-token.js';
import { RoomRepository } from '../infrastructure/room.repository.js';
import type { RoomRow } from '../infrastructure/rooms.schema.js';

/** What other modules may know about a room. */
export interface RoomSummary {
  id: string;
  hotelId: string;
  number: string;
  isOutOfOrder: boolean;
}

export class RoomsService {
  constructor(
    private readonly db: Database,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
    private readonly guestAppUrl: string,
  ) {}

  async list(hotelId: string, filter: { floor?: number; roomIds?: string[] } = {}): Promise<Room[]> {
    const rooms = await new RoomRepository(this.db).list(hotelId, filter);
    return rooms.map((room) => this.toRoom(room));
  }

  async create(hotelId: string, rooms: CreateRoomInput[]): Promise<Room[]> {
    const newRooms = rooms.map((room) => ({ ...room, hotelId, qrToken: generateQrToken() }));
    try {
      const created = await new RoomRepository(this.db).createMany(newRooms);
      return created.map((room) => this.toRoom(room));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('A room with one of these numbers already exists');
      throw error;
    }
  }

  async update(hotelId: string, roomId: string, changes: UpdateRoomInput): Promise<Room> {
    // Clearing "out of order" also clears its reason.
    const outOfOrderReason = changes.isOutOfOrder === false ? null : changes.outOfOrderReason;
    try {
      const room = await new RoomRepository(this.db).update(hotelId, roomId, { ...changes, outOfOrderReason });
      if (!room) throw new NotFoundError('Room');
      return this.toRoom(room);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('A room with this number already exists');
      throw error;
    }
  }

  /** Gives each room a new QR token. Old printed codes stop working immediately. */
  async regenerateQrCodes(actor: SignedInStaff, roomIds: string[]): Promise<Room[]> {
    return this.db.transaction(async (tx) => {
      const repository = new RoomRepository(tx);
      const rooms = await repository.list(actor.hotelId, { roomIds });
      if (rooms.length !== new Set(roomIds).size) throw new NotFoundError('Room');

      const now = this.clock.now();
      const regenerated: Room[] = [];
      for (const room of rooms) {
        const updated = await repository.update(actor.hotelId, room.id, {
          qrToken: generateQrToken(),
          qrRegeneratedAt: now,
        });
        await this.outbox.record(tx, {
          eventName: 'room.qr_regenerated',
          hotelId: actor.hotelId,
          occurredAt: now.toISOString(),
          actor: actorOf(actor),
          roomId: room.id,
          roomNumber: room.number,
        });
        regenerated.push(this.toRoom(updated!));
      }
      return regenerated;
    });
  }

  async findRoom(hotelId: string, roomId: string): Promise<RoomSummary | undefined> {
    const room = await new RoomRepository(this.db).findById(hotelId, roomId);
    return room && { id: room.id, hotelId: room.hotelId, number: room.number, isOutOfOrder: room.isOutOfOrder };
  }

  /** Looks up the room a scanned QR code belongs to. For the guest-access module. */
  async findRoomByQrToken(qrToken: string): Promise<RoomSummary | undefined> {
    const room = await new RoomRepository(this.db).findByQrToken(qrToken);
    return room && { id: room.id, hotelId: room.hotelId, number: room.number, isOutOfOrder: room.isOutOfOrder };
  }

  private toRoom(room: RoomRow): Room {
    return {
      id: room.id,
      number: room.number,
      floor: room.floor,
      isOutOfOrder: room.isOutOfOrder,
      outOfOrderReason: room.outOfOrderReason,
      qrToken: room.qrToken,
      qrUrl: `${this.guestAppUrl}/r/${room.qrToken}`,
      qrRegeneratedAt: room.qrRegeneratedAt?.toISOString() ?? null,
    };
  }
}
