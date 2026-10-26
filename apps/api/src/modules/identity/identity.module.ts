import type { FastifyInstance } from 'fastify';
import type { Database } from '../../shared/db/client.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { Outbox } from '../../shared/events/outbox.repository.js';
import { AuthService } from './application/auth.service.js';
import { StaffUsersService } from './application/staff-users.service.js';
import { createAuthGuards, type AccessTokenClaims } from './interface/http/auth-guards.js';
import { registerAuthRoutes } from './interface/http/auth.routes.js';
import { registerUserRoutes } from './interface/http/users.routes.js';

export interface IdentityModuleDeps {
  app: FastifyInstance;
  db: Database;
  outbox: Outbox;
  clock: Clock;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}

export function createIdentityModule(deps: IdentityModuleDeps) {
  const { app, db, outbox, clock, accessTokenTtlSeconds } = deps;

  const auth = new AuthService(db, clock, {
    accessTokenTtlSeconds,
    refreshTokenTtlDays: deps.refreshTokenTtlDays,
    signAccessToken: (staff) => {
      const claims: AccessTokenClaims = { sub: staff.id, hotelId: staff.hotelId, role: staff.role, name: staff.fullName };
      return app.jwt.sign(claims, { expiresIn: accessTokenTtlSeconds });
    },
  });
  const users = new StaffUsersService(db, outbox, clock);
  const guards = createAuthGuards(auth);

  /** For the WebSocket gateway, which receives the token in the URL instead of a header. */
  async function staffFromAccessToken(token: string) {
    try {
      const claims = app.jwt.verify<AccessTokenClaims>(token);
      return await auth.findActiveStaff(claims.sub);
    } catch {
      return undefined;
    }
  }

  return {
    guards,
    staffFromAccessToken,
    auth,
    users,
    registerRoutes(api: FastifyInstance) {
      registerAuthRoutes(api, auth, guards);
      registerUserRoutes(api, users, guards);
    },
  };
}

export type IdentityModule = ReturnType<typeof createIdentityModule>;
