import type { EventActor, StaffRole } from '@conciergeiq/contracts';

/** The staff member making the current request, taken from their access token. */
export interface SignedInStaff {
  id: string;
  hotelId: string;
  fullName: string;
  role: StaffRole;
}

export function actorOf(staff: SignedInStaff): EventActor {
  return { type: 'staff', id: staff.id, name: staff.fullName };
}
