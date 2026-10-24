import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.js';
import { payments, type NewPaymentRow, type PaymentRow } from './payments.schema.js';

export class PaymentRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(payment: NewPaymentRow): Promise<PaymentRow> {
    const [created] = await this.db.insert(payments).values(payment).returning();
    return created!;
  }

  async listRecordedBetween(hotelId: string, from: Date, to: Date): Promise<PaymentRow[]> {
    return this.db
      .select()
      .from(payments)
      .where(and(eq(payments.hotelId, hotelId), gte(payments.recordedAt, from), lte(payments.recordedAt, to)))
      .orderBy(desc(payments.recordedAt));
  }
}
