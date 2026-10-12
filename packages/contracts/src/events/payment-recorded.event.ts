export interface PaymentRecordedEvent {
  eventName: 'payment.recorded';
  paymentId: string;
  orderId: string;
  hotelId: string;
  amount: number;
  currency: string;
  paymentMethod: 'room_bill' | 'card' | 'cash';
  status: 'succeeded' | 'failed' | 'pending';
  transactionReference?: string;
  recordedAt: string;
}
