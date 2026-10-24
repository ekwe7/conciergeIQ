import type { FastifyRequest } from 'fastify';
import type { StaffRole } from '@conciergeiq/contracts';
import { ForbiddenError, UnauthorizedError } from '../../../../shared/errors/app-error.js';
import type { AuthService } from '../../application/auth.service.js';
import type { SignedInStaff } from '../../application/signed-in-staff.js';
import { roleCan, type Permission } from '../../domain/permissions.js';

/** What goes inside an access token. */
export interface AccessTokenClaims {
  sub: string;
  hotelId: string;
  role: StaffRole;
  name: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenClaims;
    user: AccessTokenClaims;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the auth guards. Only read it on routes that use one. */
    staff: SignedInStaff;
  }
}

export type RequestGuard = (request: FastifyRequest) => Promise<void>;

export interface AuthGuards {
  /** Any signed-in, active staff member. */
  signedIn: RequestGuard;
  /** A signed-in staff member whose role includes the permission. */
  requirePermission(permission: Permission): RequestGuard;
}

export function createAuthGuards(auth: AuthService): AuthGuards {
  const signedIn: RequestGuard = async (request) => {
    let claims: AccessTokenClaims;
    try {
      claims = await request.jwtVerify<AccessTokenClaims>();
    } catch {
      throw new UnauthorizedError();
    }

    const staff = await auth.findActiveStaff(claims.sub);
    if (!staff) throw new UnauthorizedError('Your account is no longer active');
    request.staff = staff;
  };

  return {
    signedIn,
    requirePermission: (permission) => async (request) => {
      await signedIn(request);
      if (!roleCan(request.staff.role, permission)) throw new ForbiddenError();
    },
  };
}
