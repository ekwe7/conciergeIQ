import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.js';
import { hotels, type HotelRow } from './hotels.schema.js';

export type NewHotelRow = typeof hotels.$inferInsert;

export class HotelRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(hotel: NewHotelRow): Promise<HotelRow> {
    const [created] = await this.db.insert(hotels).values(hotel).returning();
    return created!;
  }

  async findById(hotelId: string): Promise<HotelRow | undefined> {
    const [row] = await this.db.select().from(hotels).where(eq(hotels.id, hotelId));
    return row;
  }

  async update(hotelId: string, changes: Partial<NewHotelRow>): Promise<HotelRow | undefined> {
    const [row] = await this.db.update(hotels).set(changes).where(eq(hotels.id, hotelId)).returning();
    return row;
  }
}
