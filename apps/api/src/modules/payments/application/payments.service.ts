import { PaymentMethod, type Payment, type PaymentsSummary, type RecordPaymentInput } from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import { isUniqueViolation } from '../../../shared/db/errors.js';
import type { Clock } from '../../../shared/utils/clock.js';
import { toMajorUnits } from '../../../shared/domain/money.js';
import type { Outbox } from '../../../shared/events/outbox.repository.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { actorOf, type SignedInStaff } from '../../identity/index.js';
import type { OrderPaymentFacts, OrderReadModel } from '../../ordering/index.js';
import { assertOrderCanBePaid } from '../domain/payment-policy.js';
import { PaymentRepository } from '../infrastructure/payment.repository.js';
import type { PaymentRow } from '../infrastructure/payments.schema.js';

export interface Period {
  from: Date;
  to: Date;
}

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    roomNumber: row.roomNumber,
    amount: toMajorUnits(row.amountMinor),
    method: row.method,
    reference: row.reference,
    recordedBy: row.recordedByName,
    recordedAt: row.recordedAt.toISOString(),
  };
}

export class PaymentsService {
  constructor(
    private readonly db: Database,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
    private readonly orders: Pick<OrderReadModel, 'findPaymentFacts' | 'listDeliveredUnpaid'>,
  ) {}

  /** "Mark as paid": the full order total, collected at the front desk. */
  async record(actor: SignedInStaff, orderId: string, input: RecordPaymentInput): Promise<Payment> {
    const order = await this.orders.findPaymentFacts(actor.hotelId, orderId);
    if (!order) throw new NotFoundError('Order');
    assertOrderCanBePaid(order);

    const now = this.clock.now();
    try {
      return await this.db.transaction(async (tx) => {
        const payment = await new PaymentRepository(tx).create({
          hotelId: actor.hotelId,
          orderId: order.id,
          orderNumber: order.number,
          roomNumber: order.roomNumber,
          amountMinor: order.totalMinor,
          method: input.method,
          reference: input.reference,
          recordedByUserId: actor.id,
          recordedByName: actor.fullName,
          recordedAt: now,
        });
        await this.outbox.record(tx, {
          eventName: 'payment.recorded',
          hotelId: actor.hotelId,
          occurredAt: now.toISOString(),
          actor: actorOf(actor),
          paymentId: payment.id,
          orderId: order.id,
          orderNumber: order.number,
          amount: toMajorUnits(order.totalMinor),
          method: input.method,
        });
        return toPayment(payment);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('This order has already been paid');
      throw error;
    }
  }

  async list(hotelId: string, period: Period): Promise<Payment[]> {
    const rows = await new PaymentRepository(this.db).listRecordedBetween(hotelId, period.from, period.to);
    return rows.map(toPayment);
  }

  /** Delivered orders still waiting for payment. */
  async listOutstanding(hotelId: string): Promise<OrderPaymentFacts[]> {
    return this.orders.listDeliveredUnpaid(hotelId);
  }

  async summarize(hotelId: string, period: Period): Promise<PaymentsSummary> {
    const [collected, outstanding] = await Promise.all([
      new PaymentRepository(this.db).listRecordedBetween(hotelId, period.from, period.to),
      this.orders.listDeliveredUnpaid(hotelId),
    ]);

    const byMethod: Record<PaymentMethod, number> = { CASH: 0, CARD: 0, TRANSFER: 0 };
    for (const payment of collected) {
      byMethod[payment.method] += payment.amountMinor;
    }

    return {
      collected: { total: toMajorUnits(sum(collected.map((payment) => payment.amountMinor))), count: collected.length },
      byMethod: {
        [PaymentMethod.CASH]: toMajorUnits(byMethod.CASH),
        [PaymentMethod.CARD]: toMajorUnits(byMethod.CARD),
        [PaymentMethod.TRANSFER]: toMajorUnits(byMethod.TRANSFER),
      },
      outstanding: {
        total: toMajorUnits(sum(outstanding.map((order) => order.totalMinor))),
        count: outstanding.length,
      },
    };
  }

  /** Defaults to the last 24 hours. The dashboard sends the hotel's local "today". */
  periodFrom(query: { from?: string; to?: string }): Period {
    const to = query.to ? new Date(query.to) : this.clock.now();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
    return { from, to };
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
