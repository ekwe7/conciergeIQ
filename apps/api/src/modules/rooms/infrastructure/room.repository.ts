import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.js';
import { rooms, type NewRoomRow, type RoomRow } from './rooms.schema.js';

export class RoomRepository {
  constructor(private readonly db: DbExecutor) {}

  async list(hotelId: string, filter: { floor?: number; roomIds?: string[] } = {}): Promise<RoomRow[]> {
    const conditions = [eq(rooms.hotelId, hotelId)];
    if (filter.floor !== undefined) conditions.push(eq(rooms.floor, filter.floor));
    if (filter.roomIds) conditions.push(inArray(rooms.id, filter.roomIds));

    return this.db
      .select()
      .from(rooms)
      .where(and(...conditions))
      .orderBy(asc(rooms.floor), asc(rooms.number));
  }

  async findById(hotelId: string, roomId: string): Promise<RoomRow | undefined> {
    const [room] = await this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.hotelId, hotelId), eq(rooms.id, roomId)));
    return room;
  }

  async findByQrToken(qrToken: string): Promise<RoomRow | undefined> {
    const [room] = await this.db.select().from(rooms).where(eq(rooms.qrToken, qrToken));
    return room;
  }

  async createMany(newRooms: NewRoomRow[]): Promise<RoomRow[]> {
    return this.db.insert(rooms).values(newRooms).returning();
  }

  async update(hotelId: string, roomId: string, changes: Partial<NewRoomRow>): Promise<RoomRow | undefined> {
    const [room] = await this.db
      .update(rooms)
      .set(changes)
      .where(and(eq(rooms.hotelId, hotelId), eq(rooms.id, roomId)))
      .returning();
    return room;
  }
}
