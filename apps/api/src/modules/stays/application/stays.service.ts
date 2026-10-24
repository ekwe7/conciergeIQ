import type { CheckInInput, Stay, StayBill } from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import { isUniqueViolation } from '../../../shared/db/errors.js';
import type { Clock } from '../../../shared/utils/clock.js';
import { DomainRuleError } from '../../../shared/domain/domain-rule-error.js';
import { toMajorUnits } from '../../../shared/domain/money.js';
import type { Outbox } from '../../../shared/events/outbox.repository.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { actorOf, type SignedInStaff } from '../../identity/index.js';
import type { OrderReadModel } from '../../ordering/index.js';
import type { RoomSummary } from '../../rooms/index.js';
import { StayRepository } from '../infrastructure/stay.repository.js';
import type { StayRow } from '../infrastructure/stays.schema.js';

/** What the stays module needs from other modules. */
export interface StaysDependencies {
  findRoom(hotelId: string, roomId: string): Promise<RoomSummary | undefined>;
  orders: Pick<OrderReadModel, 'summarizeStay'>;
}

function toStay(stay: StayRow): Stay {
  return {
    id: stay.id,
    roomId: stay.roomId,
    roomNumber: stay.roomNumber,
    guestName: stay.guestName,
    guestPhone: stay.guestPhone,
    checkedInAt: stay.checkedInAt.toISOString(),
    expectedCheckOutAt: stay.expectedCheckOutAt.toISOString(),
    checkedOutAt: stay.checkedOutAt?.toISOString() ?? null,
  };
}

export class StaysService {
  constructor(
    private readonly db: Database,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
    private readonly dependencies: StaysDependencies,
  ) {}

  async listActive(hotelId: string): Promise<Stay[]> {
    return (await new StayRepository(this.db).listActive(hotelId)).map(toStay);
  }

  async get(hotelId: string, stayId: string): Promise<Stay> {
    return toStay(await this.requireStay(new StayRepository(this.db), hotelId, stayId));
  }

  /** Starts a stay. From now on the room's QR code opens a guest session. */
  async checkIn(actor: SignedInStaff, roomId: string, input: CheckInInput): Promise<Stay> {
    const room = await this.dependencies.findRoom(actor.hotelId, roomId);
    if (!room) throw new NotFoundError('Room');
    if (room.isOutOfOrder) throw new DomainRuleError(`Room ${room.number} is out of order`);

    const now = this.clock.now();
    const expectedCheckOutAt = new Date(input.expectedCheckOutAt);
    if (expectedCheckOutAt <= now) throw new DomainRuleError('Expected departure must be in the future');

    try {
      return await this.db.transaction(async (tx) => {
        const stay = await new StayRepository(tx).create({
          hotelId: actor.hotelId,
          roomId: room.id,
          roomNumber: room.number,
          guestName: input.guestName,
          guestPhone: input.guestPhone,
          checkedInAt: now,
          expectedCheckOutAt,
          checkedInByUserId: actor.id,
        });
        await this.outbox.record(tx, {
          eventName: 'stay.checked_in',
          hotelId: actor.hotelId,
          occurredAt: now.toISOString(),
          actor: actorOf(actor),
          stayId: stay.id,
          roomId: room.id,
          roomNumber: room.number,
          guestName: stay.guestName,
          expectedCheckOutAt: stay.expectedCheckOutAt.toISOString(),
        });
        return toStay(stay);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`Room ${room.number} already has a guest checked in`);
      throw error;
    }
  }

  /**
   * Ends a stay. The guest-access module ends every guest session for the room
   * when it hears `stay.checked_out`, so a photographed QR code stops working.
   */
  async checkOut(actor: SignedInStaff, stayId: string): Promise<Stay> {
    return this.db.transaction(async (tx) => {
      const repository = new StayRepository(tx);
      const stay = await this.requireStay(repository, actor.hotelId, stayId);
      if (stay.checkedOutAt) throw new DomainRuleError('This guest has already checked out');

      const now = this.clock.now();
      const checkedOut = await repository.markCheckedOut(stay.id, now, actor.id);
      await this.outbox.record(tx, {
        eventName: 'stay.checked_out',
        hotelId: actor.hotelId,
        occurredAt: now.toISOString(),
        actor: actorOf(actor),
        stayId: stay.id,
        roomId: stay.roomId,
        roomNumber: stay.roomNumber,
        guestName: stay.guestName,
      });
      return toStay(checkedOut);
    });
  }

  /** Orders, charges and anything still open, shown before the receptionist checks the guest out. */
  async bill(hotelId: string, stayId: string): Promise<StayBill> {
    const stay = await this.requireStay(new StayRepository(this.db), hotelId, stayId);
    const summary = await this.dependencies.orders.summarizeStay(hotelId, stay.id);

    return {
      stayId: stay.id,
      ordersCount: summary.ordersCount,
      totalCharged: toMajorUnits(summary.totalChargedMinor),
      totalPaid: toMajorUnits(summary.totalPaidMinor),
      outstanding: toMajorUnits(summary.totalChargedMinor - summary.totalPaidMinor),
      openOrders: summary.openOrders,
    };
  }

  /** The stay a QR scan should open a session for, if the room has a guest. For guest-access. */
  async findActiveStayForRoom(hotelId: string, roomId: string): Promise<Stay | undefined> {
    const stay = await new StayRepository(this.db).findActiveForRoom(hotelId, roomId);
    return stay && toStay(stay);
  }

  private async requireStay(repository: StayRepository, hotelId: string, stayId: string): Promise<StayRow> {
    const stay = await repository.findById(hotelId, stayId);
    if (!stay) throw new NotFoundError('Stay');
    return stay;
  }
}
