import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.js';
import { stays, type NewStayRow, type StayRow } from './stays.schema.js';

export class StayRepository {
  constructor(private readonly db: DbExecutor) {}

  async listActive(hotelId: string): Promise<StayRow[]> {
    return this.db
      .select()
      .from(stays)
      .where(and(eq(stays.hotelId, hotelId), isNull(stays.checkedOutAt)))
      .orderBy(asc(stays.roomNumber));
  }

  async findById(hotelId: string, stayId: string): Promise<StayRow | undefined> {
    const [stay] = await this.db
      .select()
      .from(stays)
      .where(and(eq(stays.hotelId, hotelId), eq(stays.id, stayId)));
    return stay;
  }

  async findActiveForRoom(hotelId: string, roomId: string): Promise<StayRow | undefined> {
    const [stay] = await this.db
      .select()
      .from(stays)
      .where(and(eq(stays.hotelId, hotelId), eq(stays.roomId, roomId), isNull(stays.checkedOutAt)));
    return stay;
  }

  async create(stay: NewStayRow): Promise<StayRow> {
    const [created] = await this.db.insert(stays).values(stay).returning();
    return created!;
  }

  async markCheckedOut(stayId: string, at: Date, byUserId: string): Promise<StayRow> {
    const [updated] = await this.db
      .update(stays)
      .set({ checkedOutAt: at, checkedOutByUserId: byUserId })
      .where(eq(stays.id, stayId))
      .returning();
    return updated!;
  }
}
