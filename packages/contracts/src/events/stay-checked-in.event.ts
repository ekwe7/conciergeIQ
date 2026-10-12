export interface StayCheckedInEvent {
  eventName: 'stay.checked_in';
  stayId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  guestName: string;
  guestEmail?: string;
  checkInTime: string;
  expectedCheckOutTime: string;
}
