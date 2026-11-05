import { formatOrderNumber } from '@conciergeiq/contracts';

export interface AlertFacts {
  hotelName: string;
  roomNumber: string;
  orderNumber: number;
  itemsSummary: string;
  waitedSeconds: number;
  /** Set on the admin alert when the manager was already texted. */
  managerAlerted: boolean;
  link: string;
}

/** "2 min", "1 min 30 s" */
export function formatWait(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

const MAX_SUMMARY = 40;

/**
 * The text sent to the manager or admin. Kept to one SMS where possible:
 * hotel, room, order, what was ordered, how long it has waited, and a link.
 */
export function alertMessage(facts: AlertFacts): string {
  const summary =
    facts.itemsSummary.length > MAX_SUMMARY ? `${facts.itemsSummary.slice(0, MAX_SUMMARY - 1).trimEnd()}…` : facts.itemsSummary;
  const followUp = facts.managerAlerted ? ' The manager was already alerted.' : '';
  return (
    `${facts.hotelName}: Room ${facts.roomNumber} order ${formatOrderNumber(facts.orderNumber)} (${summary}) ` +
    `has waited ${formatWait(facts.waitedSeconds)} without being accepted.${followUp} ${facts.link}`
  );
}
