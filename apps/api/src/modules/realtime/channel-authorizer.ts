import type {
  ConnectionMetadata,
  GuestConnectionMetadata,
  StaffConnectionMetadata,
} from './connection-manager.js';

/**
 * ChannelAuthorizer validates and enforces tenant-isolated broadcast authorization.
 *
 * Prevents cross-tenant and cross-room data leaks by ensuring:
 * - Guests can only subscribe to their own room, stay, and session channels.
 * - Guests are strictly forbidden from subscribing to any staff channel or another room's channel.
 * - Staff members can only subscribe to channels scoped to their hotel tenant.
 */
export class ChannelAuthorizer {
  /**
   * Determines whether the given connection is authorized to subscribe to the target channel.
   */
  authorize(metadata: ConnectionMetadata, channel: string): boolean {
    if (!metadata || !channel) {
      return false;
    }

    const trimmedChannel = channel.trim();
    if (!trimmedChannel) {
      return false;
    }

    if (metadata.clientType === 'guest') {
      return this.authorizeGuest(metadata as GuestConnectionMetadata, trimmedChannel);
    }

    if (metadata.clientType === 'staff') {
      return this.authorizeStaff(metadata as StaffConnectionMetadata, trimmedChannel);
    }

    return false;
  }

  private authorizeGuest(guest: GuestConnectionMetadata, channel: string): boolean {
    // 1. Guests are strictly forbidden from any staff channel
    if (channel.includes(':staff') || channel.startsWith('staff:')) {
      return false;
    }

    // 2. Room channel matching:
    //    Format: room:{hotelId}:{roomId} or room:{roomId}
    if (channel.startsWith('room:')) {
      const parts = channel.split(':');
      if (parts.length === 3) {
        return parts[1] === guest.hotelId && parts[2] === guest.roomId;
      }
      if (parts.length === 2) {
        return parts[1] === guest.roomId;
      }
      return false;
    }

    // 3. Stay channel matching:
    //    Format: stay:{stayId}
    if (channel.startsWith('stay:')) {
      const parts = channel.split(':');
      return parts.length === 2 && parts[1] === guest.stayId;
    }

    // 4. Session channel matching:
    //    Format: guest:{sessionId} or session:{sessionId}
    if (channel.startsWith('guest:') || channel.startsWith('session:')) {
      const parts = channel.split(':');
      return parts.length === 2 && parts[1] === guest.sessionId;
    }

    // 5. Hotel guest broadcast channel:
    //    Format: hotel:{hotelId}:guests
    if (channel === `hotel:${guest.hotelId}:guests`) {
      return true;
    }

    return false;
  }

  private authorizeStaff(staff: StaffConnectionMetadata, channel: string): boolean {
    // 1. Hotel channels must match staff's hotelId
    if (channel.startsWith('hotel:')) {
      const parts = channel.split(':');
      if (parts.length < 2) return false;
      const targetHotelId = parts[1];
      if (targetHotelId !== staff.hotelId) {
        return false;
      }
      // Allowed: hotel:{hotelId}, hotel:{hotelId}:staff, hotel:{hotelId}:guests
      return true;
    }

    // 2. Room channels: staff can access room channels within their own hotel
    if (channel.startsWith('room:')) {
      const parts = channel.split(':');
      if (parts.length === 3) {
        // room:{hotelId}:{roomId}
        return parts[1] === staff.hotelId;
      }
      // If room:{roomId} without hotelId, cannot guarantee tenant isolation -> reject
      return false;
    }

    // 3. Personal staff channel:
    //    Format: staff:{userId} or user:{userId}
    if (channel.startsWith('staff:') || channel.startsWith('user:')) {
      const parts = channel.split(':');
      return parts.length === 2 && parts[1] === staff.userId;
    }

    // 4. Generic tenant check: if channel contains a hotelId, it must match
    if (channel.includes(':') && channel.includes(staff.hotelId)) {
      return true;
    }

    return false;
  }
}
