import type { OrderStatus } from '../order-status.js';

export type StaffWSMessageType =
  | 'STAFF_CONNECTED'
  | 'NEW_ORDER_RECEIVED'
  | 'ORDER_STATUS_CHANGED'
  | 'NEW_SERVICE_REQUEST'
  | 'SERVICE_REQUEST_CHANGED'
  | 'EMERGENCY_ALERT';

export interface StaffConnectedMessage {
  type: 'STAFF_CONNECTED';
  payload: {
    userId: string;
    hotelId: string;
    serverTime: string;
  };
}

export interface StaffNewOrderMessage {
  type: 'NEW_ORDER_RECEIVED';
  payload: {
    orderId: string;
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
    previousStatus: OrderStatus;
    newStatus: OrderStatus;
    updatedByUserId?: string;
    updatedAt: string;
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
  | StaffNewServiceRequestMessage
  | StaffEmergencyAlertMessage;
