import type { OrderStatus } from '../order-status.js';
import type { PaymentMethod } from '../payment-method.js';

export type StaffWSMessageType = StaffWSMessage['type'];

export interface StaffConnectedMessage {
  type: 'STAFF_CONNECTED';
  payload: {
    userId: string;
    hotelId: string;
    serverTime: string;
  };
}

/** A guest placed an order. The dashboard plays the new-order sound on this message. */
export interface StaffNewOrderMessage {
  type: 'NEW_ORDER_RECEIVED';
  payload: {
    orderId: string;
    orderNumber: number;
    roomNumber: string;
    totalAmount: number;
    itemsSummary: string;
    createdAt: string;
  };
}

export interface StaffOrderStatusChangedMessage {
  type: 'ORDER_STATUS_CHANGED';
  payload: {
    orderId: string;
    orderNumber: number;
    previousStatus: OrderStatus;
    newStatus: OrderStatus;
    changedBy?: string;
    updatedAt: string;
  };
}

export interface StaffPaymentRecordedMessage {
  type: 'PAYMENT_RECORDED';
  payload: {
    orderId: string;
    orderNumber: number;
    amount: number;
    method: PaymentMethod;
    recordedAt: string;
  };
}

export interface StaffItemAvailabilityChangedMessage {
  type: 'ITEM_AVAILABILITY_CHANGED';
  payload: {
    itemId: string;
    itemName: string;
    isAvailable: boolean;
  };
}

/** The signed-in account was deactivated. The dashboard signs out on this message. */
export interface StaffSessionRevokedMessage {
  type: 'SESSION_REVOKED';
  payload: {
    reason: 'deactivated';
  };
}

export interface StaffNewServiceRequestMessage {
  type: 'NEW_SERVICE_REQUEST';
  payload: {
    requestId: string;
    roomNumber: string;
    category: string;
    details: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    createdAt: string;
  };
}

export interface StaffEmergencyAlertMessage {
  type: 'EMERGENCY_ALERT';
  payload: {
    alertId: string;
    roomNumber: string;
    message: string;
    timestamp: string;
  };
}

export type StaffWSMessage =
  | StaffConnectedMessage
  | StaffNewOrderMessage
  | StaffOrderStatusChangedMessage
  | StaffPaymentRecordedMessage
  | StaffItemAvailabilityChangedMessage
  | StaffSessionRevokedMessage
  | StaffNewServiceRequestMessage
  | StaffEmergencyAlertMessage;
