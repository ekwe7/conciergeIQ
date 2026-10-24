import type { AuthTokenResponse, StaffLoginInput } from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import type { Clock } from '../../../shared/utils/clock.js';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';
import type { UserRow } from '../infrastructure/identity.schema.js';
import { verifyPassword } from '../infrastructure/password-hasher.js';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository.js';
import { UserRepository } from '../infrastructure/user.repository.js';
import type { SignedInStaff } from './signed-in-staff.js';
import { toStaffUser } from './staff-user.mapper.js';

export interface AuthSettings {
  signAccessToken(staff: SignedInStaff): string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly settings: AuthSettings,
  ) {}

  async signIn({ email, password }: StaffLoginInput): Promise<AuthTokenResponse> {
    const user = await new UserRepository(this.db).findByEmail(email);
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

    // One message for every failure, so the response never reveals which emails exist.
    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedError('Email or password is incorrect');
    }

    return this.db.transaction(async (tx) => {
      const signedIn = await new UserRepository(tx).update(user.hotelId, user.id, {
        lastSignedInAt: this.clock.now(),
      });
      return this.issueTokens(new RefreshTokenRepository(tx), signedIn);
    });
  }

  /** Swaps a refresh token for a new pair. Each refresh token works once. */
  async refresh(refreshToken: string): Promise<AuthTokenResponse> {
    const result = await this.db.transaction(async (tx) => {
      const tokens = new RefreshTokenRepository(tx);
      const stored = await tokens.find(refreshToken);
      const now = this.clock.now();

      if (!stored || stored.expiresAt <= now) return 'expired';

      if (stored.revokedAt) {
        // A used token came back: someone may have copied it. End every session for this user.
        await tokens.revokeAllForUser(stored.userId, now);
        return 'reused';
      }

      const user = await new UserRepository(tx).findById(stored.userId);
      if (!user?.isActive) return 'expired';

      await tokens.revoke(stored.id, now);
      return this.issueTokens(tokens, user);
    });

    // Thrown after the transaction commits, so revoking a reused token's sessions is kept.
    if (typeof result === 'string') throw new UnauthorizedError('Your session has expired. Sign in again');
    return result;
  }

  async signOut(refreshToken: string): Promise<void> {
    const tokens = new RefreshTokenRepository(this.db);
    const stored = await tokens.find(refreshToken);
    if (stored && !stored.revokedAt) {
      await tokens.revoke(stored.id, this.clock.now());
    }
  }

  /** Re-reads the user on every request, so role changes and deactivation apply immediately. */
  async findActiveStaff(userId: string): Promise<SignedInStaff | undefined> {
    const user = await new UserRepository(this.db).findById(userId);
    if (!user?.isActive) return undefined;
    return { id: user.id, hotelId: user.hotelId, fullName: user.fullName, role: user.role };
  }

  private async issueTokens(tokens: RefreshTokenRepository, user: UserRow): Promise<AuthTokenResponse> {
    const expiresAt = new Date(this.clock.now().getTime() + this.settings.refreshTokenTtlDays * DAY_IN_MS);
    const refreshToken = await tokens.issue(user.id, expiresAt);
    const accessToken = this.settings.signAccessToken({
      id: user.id,
      hotelId: user.hotelId,
      fullName: user.fullName,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.settings.accessTokenTtlSeconds,
      user: toStaffUser(user),
    };
  }
}
