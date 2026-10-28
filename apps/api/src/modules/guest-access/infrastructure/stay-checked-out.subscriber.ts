/**
 * WHAT IT DOES:
 * Subscribes to the `stay.checked_out` domain event on the application `EventBus` and
 * triggers immediate revocation of all active guest sessions for the checked-out stay.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - When a hotel receptionist checks out a guest, any photographed or bookmarked QR code
 *   links must instantly cease working to prevent fraudulent room-service charges.
 * - By decoupling this reaction through the in-memory event bus, the stays domain does not
 *   need to know about or import guest session services.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import type { EventBus } from '../../../shared/events/event-bus.js';
import type { StayCheckedOutEvent } from '@conciergeiq/contracts';
import type { GuestSessionService } from '../application/guest-session.service.js';

export interface RegisterStayCheckedOutSubscriberOptions {
  readonly eventBus: EventBus;
  readonly guestSessionService: GuestSessionService;
  readonly logger?: {
    info(message: string, ...optionalParams: unknown[]): void;
    error(message: string, ...optionalParams: unknown[]): void;
  };
}

/**
 * Registers an asynchronous subscriber for the `stay.checked_out` event.
 */
export const registerStayCheckedOutSubscriber = ({
  eventBus,
  guestSessionService,
  logger,
}: RegisterStayCheckedOutSubscriberOptions): void => {
  eventBus.subscribe<StayCheckedOutEvent>(
    'stay.checked_out',
    async (checkedOutEvent: StayCheckedOutEvent): Promise<void> => {
      try {
        const revokedSessionIdentifiersList =
          await guestSessionService.revokeSessionsForStay(
            checkedOutEvent.stayId,
            'checked_out'
          );

        if (logger && revokedSessionIdentifiersList.length > 0) {
          logger.info(
            `Revoked ${revokedSessionIdentifiersList.length} guest sessions for stay ${checkedOutEvent.stayId} (Room ${checkedOutEvent.roomNumber})`
          );
        }
      } catch (revocationError) {
        if (logger) {
          logger.error(
            `Failed to revoke guest sessions for stay ${checkedOutEvent.stayId}:`,
            revocationError
          );
        }
      }
    }
  );
};
