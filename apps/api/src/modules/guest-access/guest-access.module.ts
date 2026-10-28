/**
 * WHAT IT DOES:
 * Encapsulates the Guest Access module: initializes the `GuestSessionService`, registers
 * the `stay.checked_out` event subscriber, and exposes route registration for Fastify.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Follows the project's modular composition pattern (`create...Module`).
 * - Encapsulates event registration and route handlers while exposing the public service API.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import type { FastifyInstance } from 'fastify';
import type { EventBus } from '../../shared/events/event-bus.js';
import type { Clock } from '../../shared/utils/clock.js';
import type { QRTokenService } from '../rooms/domain/qr-token.service.js';
import { GuestSessionService } from './application/guest-session.service.js';
import type { ActiveStayLookupPort } from './application/ports/active-stay-lookup.port.js';
import type { RoomLookupPort } from './application/ports/room-lookup.port.js';
import type { GuestSessionClaims, GuestSessionRegistry } from './domain/guest-session.js';
import { registerStayCheckedOutSubscriber } from './infrastructure/stay-checked-out.subscriber.js';
import { registerGuestRoutes } from './interface/http/guest-session.routes.js';

export interface GuestAccessModuleDependencies {
  readonly eventBus: EventBus;
  readonly clock: Clock;
  readonly activeStayLookupPort: ActiveStayLookupPort;
  readonly qrTokenService?: QRTokenService;
  readonly roomLookupPort?: RoomLookupPort;
  readonly sessionRegistry?: GuestSessionRegistry;
  readonly signGuestToken?: (sessionClaims: GuestSessionClaims) => string;
  readonly sessionTtlSeconds?: number;
  readonly logger?: {
    info(message: string, ...optionalParams: unknown[]): void;
    error(message: string, ...optionalParams: unknown[]): void;
  };
}

export const createGuestAccessModule = (
  dependencies: GuestAccessModuleDependencies
) => {
  const guestSessionService = new GuestSessionService({
    activeStayLookupPort: dependencies.activeStayLookupPort,
    qrTokenService: dependencies.qrTokenService,
    roomLookupPort: dependencies.roomLookupPort,
    sessionRegistry: dependencies.sessionRegistry,
    clock: dependencies.clock,
    eventBus: dependencies.eventBus,
    signGuestToken: dependencies.signGuestToken,
    sessionTtlSeconds: dependencies.sessionTtlSeconds,
  });

  registerStayCheckedOutSubscriber({
    eventBus: dependencies.eventBus,
    guestSessionService,
    logger: dependencies.logger,
  });

  return {
    guestSessionService,
    registerRoutes(apiInstance: FastifyInstance): void {
      registerGuestRoutes(apiInstance, { guestSessionService });
    },
  };
};

export type GuestAccessModule = ReturnType<typeof createGuestAccessModule>;
