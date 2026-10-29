// Public API of the guest-access module. Other modules import from this file only.
export {
  createGuestAccessModule,
  type GuestAccessModule,
  type GuestAccessModuleDependencies,
} from './guest-access.module.js';

export {
  GuestSessionService,
  type GuestSessionServiceDependencies,
} from './application/guest-session.service.js';

export {
  type ActiveStayLookupPort,
  type ActiveStaySummary,
  MockActiveStayLookupPort,
} from './application/ports/active-stay-lookup.port.js';

export {
  type RoomLookupPort,
  type RoomSummaryForGuestAccess,
  MockRoomLookupPort,
} from './application/ports/room-lookup.port.js';

export {
  type GuestSession,
  type GuestSessionClaims,
  type GuestSessionRegistry,
  type GuestSessionState,
  InMemoryGuestSessionRegistry,
} from './domain/guest-session.js';

export {
  registerStayCheckedOutSubscriber,
  type RegisterStayCheckedOutSubscriberOptions,
} from './infrastructure/stay-checked-out.subscriber.js';

export {
  registerGuestRoutes,
  type GuestRoutesDependencies,
} from './interface/http/guest-session.routes.js';
