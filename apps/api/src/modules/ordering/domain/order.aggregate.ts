import { EmptyOrderError } from './errors.js';
import { subtotalOf, type OrderItem } from './order-item.js';
import type { OrderState } from './order-state/order-state.js';
import { stateForStatus } from './order-state/state-for-status.js';
import { OrderStatus } from './order-status.js';

export interface OrderProps {
  id: string;
  hotelId: string;
  number: number;
  roomId: string;
  roomNumber: string;
  stayId: string;
  items: OrderItem[];
  status: OrderStatus;
  cancelReason: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusChange {
  from: OrderStatus;
  to: OrderStatus;
}

/**
 * An order placed from a room. Its status only changes through `advance()`
 * and `cancel()`, and the current state object decides whether that is allowed.
 */
export class Order {
  private state: OrderState;
  private props: Omit<OrderProps, 'status'>;

  private constructor({ status, ...props }: OrderProps) {
    this.props = props;
    this.state = stateForStatus(status);
  }

  static place(props: Omit<OrderProps, 'status' | 'cancelReason' | 'updatedAt'>): Order {
    if (props.items.length === 0) throw new EmptyOrderError();
    return new Order({ ...props, status: OrderStatus.PENDING, cancelReason: null, updatedAt: props.createdAt });
  }

  /** Rebuilds an order that was already saved. */
  static restore(props: OrderProps): Order {
    return new Order(props);
  }

  /** Accepts a pending order, or delivers one in progress. */
  advance(at: Date): StatusChange {
    return this.moveTo(this.state.next(), at);
  }

  cancel(reason: string, at: Date): StatusChange {
    const change = this.moveTo(this.state.cancel(), at);
    this.props.cancelReason = reason;
    return change;
  }

  get id(): string {
    return this.props.id;
  }

  get hotelId(): string {
    return this.props.hotelId;
  }

  get number(): number {
    return this.props.number;
  }

  get roomId(): string {
    return this.props.roomId;
  }

  get roomNumber(): string {
    return this.props.roomNumber;
  }

  get status(): OrderStatus {
    return this.state.status;
  }

  get items(): readonly OrderItem[] {
    return this.props.items;
  }

  get totalMinor(): number {
    return this.props.items.reduce((total, item) => total + subtotalOf(item), 0);
  }

  toProps(): OrderProps {
    return { ...this.props, items: [...this.props.items], status: this.status };
  }

  private moveTo(next: OrderState, at: Date): StatusChange {
    const change = { from: this.state.status, to: next.status };
    this.state = next;
    this.props.updatedAt = at;
    return change;
  }
}
