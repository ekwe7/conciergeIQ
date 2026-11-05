/**
 * WHAT IT DOES:
 * Core `Order` aggregate root enforcing the order lifecycle state machine,
 * monetary totals, item immutability after placement, and domain event emission.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Extends `AggregateRoot<OrderId>` using compile-time branded `OrderId` primitives.
 * - Employs the State Pattern (`PendingState`, `InProgressState`, `DeliveredState`, `CancelledState`)
 *   to encapsulate valid status transitions and prevent illegal jumps (e.g. PENDING directly to DELIVERED)
 *   or modifications to terminal states (DELIVERED, CANCELLED).
 * - Enforces immutability: once an order moves past `PENDING`, items cannot be modified.
 * - Records strongly typed domain events: `OrderCreatedEvent` upon placement, and
 *   `OrderStatusChangedEvent` on status transitions.
 * - Pure domain logic: no framework (Fastify) or database (Drizzle) imports.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import type { EventActor, OrderCreatedEvent, OrderStatusChangedEvent } from '@conciergeiq/contracts';
import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { createOrderId, type OrderId } from '../../../shared/domain/ids.js';
import { toMajorUnits } from '../../../shared/domain/money.js';
import { EmptyOrderError, InvalidStateTransitionError } from './errors.js';
import { subtotalOf, type OrderItem } from './order-item.js';
import type { OrderState } from './order-state/order-state.js';
import { stateForStatus } from './order-state/state-for-status.js';
import { OrderStatus } from './order-status.js';

export interface OrderProps {
  readonly id: string;
  readonly hotelId: string;
  readonly number: number;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly stayId: string;
  items: OrderItem[];
  readonly status: OrderStatus;
  cancelReason: string | null;
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;
  updatedAt: Date;
  readonly actor?: EventActor;
}

export interface StatusChange {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
}

export class Order extends AggregateRoot<OrderId> {
  private activeState: OrderState;
  private readonly orderProperties: Omit<OrderProps, 'status'>;

  private constructor({ status, ...restOfProps }: OrderProps) {
    const brandedOrderId = createOrderId(restOfProps.id);
    super(brandedOrderId);
    this.orderProperties = restOfProps;
    this.activeState = stateForStatus(status);
  }

  /**
   * Places a brand-new in-room guest order starting in `PENDING` status.
   * Records an `OrderCreatedEvent`.
   */
  public static place = (
    placementProps: Omit<OrderProps, 'status' | 'cancelReason' | 'updatedAt'>
  ): Order => {
    if (!placementProps.items || placementProps.items.length === 0) {
      throw new EmptyOrderError();
    }

    const createdOrderInstance = new Order({
      ...placementProps,
      status: OrderStatus.PENDING,
      cancelReason: null,
      updatedAt: placementProps.createdAt,
    });

    const orderCreatedDomainEvent: OrderCreatedEvent = {
      eventName: 'order.created',
      hotelId: createdOrderInstance.hotelId,
      occurredAt: placementProps.createdAt.toISOString(),
      actor: placementProps.actor ?? {
        type: 'guest',
        roomNumber: createdOrderInstance.roomNumber,
      },
      orderId: createdOrderInstance.id,
      orderNumber: createdOrderInstance.number,
      roomId: createdOrderInstance.roomId,
      roomNumber: createdOrderInstance.roomNumber,
      items: createdOrderInstance.items.map((orderItem) => ({
        itemId: orderItem.itemId,
        name: orderItem.name,
        quantity: orderItem.quantity,
        unitPrice: toMajorUnits(orderItem.unitPriceMinor),
        notes: orderItem.notes,
      })),
      totalAmount: createdOrderInstance.totalAmount,
      status: OrderStatus.PENDING,
    };

    createdOrderInstance.addDomainEvent(orderCreatedDomainEvent);
    return createdOrderInstance;
  };

  /**
   * Restores an existing order aggregate from persistent storage without emitting creation events.
   */
  public static restore = (existingOrderProps: OrderProps): Order => {
    return new Order(existingOrderProps);
  };

  /**
   * Accepts a pending order moving it to `IN_PROGRESS`.
   */
  public accept = (
    transitionTimestamp: Date,
    actor?: EventActor
  ): StatusChange => {
    return this.transitionToState(
      this.activeState.accept(),
      transitionTimestamp,
      undefined,
      actor
    );
  };

  /**
   * Delivers an in-progress order moving it to `DELIVERED`.
   */
  public deliver = (
    transitionTimestamp: Date,
    actor?: EventActor
  ): StatusChange => {
    return this.transitionToState(
      this.activeState.deliver(),
      transitionTimestamp,
      undefined,
      actor
    );
  };

  /**
   * Cancels an order in `PENDING` or `IN_PROGRESS` status with a reason.
   */
  public cancel = (
    cancellationReason: string,
    transitionTimestamp: Date,
    actor?: EventActor
  ): StatusChange => {
    this.orderProperties.cancelReason = cancellationReason;
    return this.transitionToState(
      this.activeState.cancel(),
      transitionTimestamp,
      cancellationReason,
      actor
    );
  };

  /**
   * Sequential step advancement: PENDING -> IN_PROGRESS -> DELIVERED.
   */
  public advance = (
    transitionTimestamp: Date,
    actor?: EventActor
  ): StatusChange => {
    return this.transitionToState(
      this.activeState.next(),
      transitionTimestamp,
      undefined,
      actor
    );
  };

  /**
   * Modifies items while the order is in `PENDING` status.
   * Throws `InvalidStateTransitionError` if the order is already in progress or completed.
   */
  public updateItems = (newItemsList: OrderItem[]): void => {
    if (this.status !== OrderStatus.PENDING) {
      throw new InvalidStateTransitionError(
        'Cannot modify items of an order that has already transitioned out of PENDING'
      );
    }
    if (!newItemsList || newItemsList.length === 0) {
      throw new EmptyOrderError();
    }
    this.orderProperties.items = [...newItemsList];
  };

  // --- Aggregate Getters ---

  public get hotelId(): string {
    return this.orderProperties.hotelId;
  }

  public get number(): number {
    return this.orderProperties.number;
  }

  public get roomId(): string {
    return this.orderProperties.roomId;
  }

  public get roomNumber(): string {
    return this.orderProperties.roomNumber;
  }

  public get stayId(): string {
    return this.orderProperties.stayId;
  }

  public get status(): OrderStatus {
    return this.activeState.status;
  }

  public get items(): readonly OrderItem[] {
    return Object.freeze([...this.orderProperties.items]);
  }

  public get totalMinor(): number {
    return this.orderProperties.items.reduce(
      (cumulativeSubtotal, currentItem) =>
        cumulativeSubtotal + subtotalOf(currentItem),
      0
    );
  }

  public get totalAmount(): number {
    return toMajorUnits(this.totalMinor);
  }

  public get cancelReason(): string | null {
    return this.orderProperties.cancelReason;
  }

  public get idempotencyKey(): string | null {
    return this.orderProperties.idempotencyKey;
  }

  public get createdAt(): Date {
    return this.orderProperties.createdAt;
  }

  public get updatedAt(): Date {
    return this.orderProperties.updatedAt;
  }

  /**
   * Serializes the aggregate properties for repository persistence.
   */
  public toProps = (): OrderProps => {
    return {
      id: this.id,
      hotelId: this.hotelId,
      number: this.number,
      roomId: this.roomId,
      roomNumber: this.roomNumber,
      stayId: this.stayId,
      items: [...this.orderProperties.items],
      status: this.status,
      cancelReason: this.cancelReason,
      idempotencyKey: this.idempotencyKey,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  };

  private transitionToState = (
    nextTargetState: OrderState,
    transitionTimestamp: Date,
    cancellationReason?: string,
    actor?: EventActor
  ): StatusChange => {
    const executedStatusChange: StatusChange = {
      from: this.activeState.status,
      to: nextTargetState.status,
    };

    this.activeState = nextTargetState;
    this.orderProperties.updatedAt = transitionTimestamp;

    const orderStatusChangedDomainEvent: OrderStatusChangedEvent = {
      eventName: 'order.status_changed',
      hotelId: this.hotelId,
      occurredAt: transitionTimestamp.toISOString(),
      actor: actor ?? { type: 'system' },
      orderId: this.id,
      orderNumber: this.number,
      roomId: this.roomId,
      roomNumber: this.roomNumber,
      previousStatus: executedStatusChange.from,
      newStatus: executedStatusChange.to,
      ...(cancellationReason ? { reason: cancellationReason } : {}),
    };

    this.addDomainEvent(orderStatusChangedDomainEvent);
    return executedStatusChange;
  };
}
