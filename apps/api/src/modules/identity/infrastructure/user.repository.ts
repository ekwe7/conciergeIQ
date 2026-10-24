import { and, asc, eq } from 'drizzle-orm';
import type { StaffRole } from '@conciergeiq/contracts';
import type { DbExecutor } from '../../../shared/db/client.js';
import { users, type UserRow } from './identity.schema.js';

export interface NewUser {
  hotelId: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: StaffRole;
}

export class UserRepository {
  constructor(private readonly db: DbExecutor) {}

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    return user;
  }

  /** Finds a user by id regardless of hotel. Only for checking a verified access token. */
  async findById(userId: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async findInHotel(hotelId: string, userId: string): Promise<UserRow | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.hotelId, hotelId), eq(users.id, userId)));
    return user;
  }

  async listForHotel(hotelId: string): Promise<UserRow[]> {
    return this.db.select().from(users).where(eq(users.hotelId, hotelId)).orderBy(asc(users.fullName));
  }

  async create(user: NewUser): Promise<UserRow> {
    const [created] = await this.db.insert(users).values(user).returning();
    return created!;
  }

  async update(
    hotelId: string,
    userId: string,
    changes: Partial<Pick<UserRow, 'fullName' | 'role' | 'isActive' | 'lastSignedInAt'>>,
  ): Promise<UserRow> {
    const [updated] = await this.db
      .update(users)
      .set(changes)
      .where(and(eq(users.hotelId, hotelId), eq(users.id, userId)))
      .returning();
    return updated!;
  }
}
