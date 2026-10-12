import type { OrderStatus } from '../order-status.js';

export type GuestWSMessageType =
  | 'GUEST_CONNECTED'
  | 'ORDER_STATUS_UPDATED'
  | 'SERVICE_REQUEST_UPDATED'
  | 'HOTEL_ANNOUNCEMENT'
  | 'SESSION_EXPIRED';

export interface GuestConnectedMessage {
  type: 'GUEST_CONNECTED';
  payload: {
    sessionId: string;
    roomNumber: string;
    serverTime: string;
  };
}

export interface GuestOrderStatusMessage {
  type: 'ORDER_STATUS_UPDATED';
  payload: {
    orderId: string;
    status: OrderStatus;
    estimatedDelivery?: string;
    updatedAt: string;
  };
}

export interface GuestServiceRequestUpdateMessage {
  type: 'SERVICE_REQUEST_UPDATED';
  payload: {
    requestId: string;
    status: string;
    notes?: string;
    updatedAt: string;
  };
}

export interface GuestAnnouncementMessage {
  type: 'HOTEL_ANNOUNCEMENT';
  payload: {
    id: string;
    title: string;
    message: string;
    priority: 'low' | 'normal' | 'urgent';
  };
}

export interface GuestSessionExpiredMessage {
  type: 'SESSION_EXPIRED';
  payload: {
    reason: string;
  };
}

export type GuestWSMessage =
  | GuestConnectedMessage
  | GuestOrderStatusMessage
  | GuestServiceRequestUpdateMessage
  | GuestAnnouncementMessage
  | GuestSessionExpiredMessage;
