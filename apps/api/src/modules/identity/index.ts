// Public API of the identity module. Other modules import from this file only.
export { createIdentityModule, type IdentityModule } from './identity.module.js';
export { Permission, roleCan } from './domain/permissions.js';
export { actorOf, type SignedInStaff } from './application/signed-in-staff.js';
export type { AccessTokenClaims, AuthGuards } from './interface/http/auth-guards.js';
