import type { CreateStaffUserInput, StaffUser, UpdateStaffUserInput } from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import type { Clock } from '../../../shared/utils/clock.js';
import type { Outbox } from '../../../shared/events/outbox.repository.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/errors/app-error.js';
import { canManageRole } from '../domain/permissions.js';
import { hashPassword } from '../infrastructure/password-hasher.js';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository.js';
import { UserRepository } from '../infrastructure/user.repository.js';
import { actorOf, type SignedInStaff } from './signed-in-staff.js';
import { toStaffUser } from './staff-user.mapper.js';

export class StaffUsersService {
  constructor(
    private readonly db: Database,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
  ) {}

  async list(actor: SignedInStaff): Promise<StaffUser[]> {
    const users = await new UserRepository(this.db).listForHotel(actor.hotelId);
    return users.map(toStaffUser);
  }

  async create(actor: SignedInStaff, input: CreateStaffUserInput): Promise<StaffUser> {
    if (!canManageRole(actor.role, input.role)) {
      throw new ForbiddenError(`Your role cannot add a ${input.role.toLowerCase()}`);
    }

    const users = new UserRepository(this.db);
    if (await users.findByEmail(input.email)) {
      throw new ConflictError('An account with this email already exists');
    }

    const created = await users.create({
      hotelId: actor.hotelId,
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    });
    return toStaffUser(created);
  }

  async hasAccount(email: string): Promise<boolean> {
    return (await new UserRepository(this.db).findByEmail(email.toLowerCase())) !== undefined;
  }

  /** Creates an account without a signed-in actor. Only for hotel setup and the demo seed. */
  async createAccount(hotelId: string, input: CreateStaffUserInput): Promise<StaffUser> {
    const created = await new UserRepository(this.db).create({
      hotelId,
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    });
    return toStaffUser(created);
  }

  async update(actor: SignedInStaff, userId: string, changes: UpdateStaffUserInput): Promise<StaffUser> {
    return this.db.transaction(async (tx) => {
      const users = new UserRepository(tx);
      const target = await users.findInHotel(actor.hotelId, userId);
      if (!target) throw new NotFoundError('Staff member');

      const changesOwnAccess = changes.role !== undefined || changes.isActive === false;
      if (target.id === actor.id && changesOwnAccess) {
        throw new ForbiddenError('You cannot change your own role or deactivate yourself');
      }
      if (!canManageRole(actor.role, target.role)) {
        throw new ForbiddenError(`Your role cannot change a ${target.role.toLowerCase()}`);
      }
      if (changes.role && !canManageRole(actor.role, changes.role)) {
        throw new ForbiddenError(`Your role cannot make someone a ${changes.role.toLowerCase()}`);
      }

      const updated = await users.update(actor.hotelId, userId, changes);

      const wasDeactivated = target.isActive && !updated.isActive;
      if (wasDeactivated) {
        const now = this.clock.now();
        await new RefreshTokenRepository(tx).revokeAllForUser(userId, now);
        await this.outbox.record(tx, {
          eventName: 'user.deactivated',
          hotelId: actor.hotelId,
          occurredAt: now.toISOString(),
          actor: actorOf(actor),
          userId,
          userName: updated.fullName,
        });
      }

      return toStaffUser(updated);
    });
  }
}
