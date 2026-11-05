import type { EscalationAlertStatus, EscalationStep, OrderEscalatedEvent } from '@conciergeiq/contracts';
import { and, desc, eq, gte } from 'drizzle-orm';
import type { Database } from '../../../shared/db/client.js';
import type { Outbox } from '../../../shared/events/outbox.repository.js';
import { alerts, rules, type AlertRow, type RulesRow } from './escalations.schema.js';

export type NewAlert = Omit<typeof alerts.$inferInsert, 'id' | 'status' | 'providerMessageId' | 'error'>;

/** Every query the escalations module makes. */
export class EscalationRepository {
  constructor(
    private readonly db: Database,
    private readonly outbox: Outbox,
  ) {}

  async findRules(hotelId: string): Promise<RulesRow | undefined> {
    const [row] = await this.db.select().from(rules).where(eq(rules.hotelId, hotelId));
    return row;
  }

  async listAllRules(): Promise<RulesRow[]> {
    return this.db.select().from(rules);
  }

  async saveRules(values: {
    hotelId: string;
    manager: EscalationStep;
    admin: EscalationStep;
    updatedAt: Date;
    updatedByUserId: string;
  }): Promise<RulesRow> {
    const { hotelId, ...changes } = values;
    const [row] = await this.db
      .insert(rules)
      .values(values)
      .onConflictDoUpdate({ target: rules.hotelId, set: changes })
      .returning();
    return row;
  }

  /** Claims the (order, level) alert. Returns its id, or undefined if another check already claimed it. */
  async claim(alert: NewAlert): Promise<string | undefined> {
    const [claimed] = await this.db
      .insert(alerts)
      .values({ ...alert, status: 'SENDING' })
      .onConflictDoNothing({ target: [alerts.orderId, alerts.level] })
      .returning({ id: alerts.id });
    return claimed?.id;
  }

  async wasDelivered(orderId: string, level: number): Promise<boolean> {
    const rows = await this.db
      .select({ status: alerts.status })
      .from(alerts)
      .where(and(eq(alerts.orderId, orderId), eq(alerts.level, level)));
    return rows.some((row) => row.status === 'SENT');
  }

  /** Records how the send went, and the event for the activity log and live dashboards, together. */
  async complete(
    alertId: string,
    outcome: { status: EscalationAlertStatus; error: string | null; providerMessageId: string | null },
    event: OrderEscalatedEvent,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(alerts).set(outcome).where(eq(alerts.id, alertId));
      await this.outbox.record(tx, event);
    });
  }

  async listSince(hotelId: string, since: Date, limit: number): Promise<AlertRow[]> {
    return this.db
      .select()
      .from(alerts)
      .where(and(eq(alerts.hotelId, hotelId), gte(alerts.sentAt, since)))
      .orderBy(desc(alerts.sentAt))
      .limit(limit);
  }
}
