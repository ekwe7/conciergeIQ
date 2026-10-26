import { OrderStatus } from '@conciergeiq/contracts';
import { DomainRuleError } from '../../../shared/domain/domain-rule-error.js';

export interface PayableOrder {
  status: OrderStatus;
  totalMinor: number;
  isPaid: boolean;
}

/** Payment is collected at the desk once staff have accepted the order, and only once. */
export function assertOrderCanBePaid(order: PayableOrder): void {
  if (order.isPaid) throw new DomainRuleError('This order has already been paid');
  if (order.status === OrderStatus.CANCELLED) throw new DomainRuleError('A cancelled order cannot be paid');
  if (order.status === OrderStatus.PENDING) throw new DomainRuleError('Accept the order before recording a payment');
  if (order.totalMinor === 0) throw new DomainRuleError('This order has no charge');
}
