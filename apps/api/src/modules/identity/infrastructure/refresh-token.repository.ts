import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.js';
import { refreshTokens } from './identity.schema.js';

/** Only a hash is stored, so a database leak does not leak usable tokens. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class RefreshTokenRepository {
  constructor(private readonly db: DbExecutor) {}

  /** Creates a token and returns the raw value. It is never stored or shown again. */
  async issue(userId: string, expiresAt: Date): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(refreshTokens).values({ userId, tokenHash: hashToken(token), expiresAt });
    return token;
  }

  async find(token: string) {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hashToken(token)));
    return row;
  }

  async revoke(tokenId: string, now: Date): Promise<void> {
    await this.db.update(refreshTokens).set({ revokedAt: now }).where(eq(refreshTokens.id, tokenId));
  }

  async revokeAllForUser(userId: string, now: Date): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
