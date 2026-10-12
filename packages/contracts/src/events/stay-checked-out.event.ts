export interface StayCheckedOutEvent {
  eventName: 'stay.checked_out';
  stayId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  checkOutTime: string;
}
