import {
  EscalationAlertStatus,
  EscalationChannel,
  EscalationLevel,
  type EscalationAlert,
  type EscalationRules,
  type EscalationStep,
  type SendTestAlertInput,
  type TestAlertResult,
  type UpdateEscalationRulesInput,
} from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import type { Outbox } from '../../../shared/events/outbox.repository.js';
import type { Clock } from '../../../shared/utils/clock.js';
import type { SignedInStaff } from '../../identity/index.js';
import type { OrderReadModel, WaitingOrder } from '../../ordering/index.js';
import { alertMessage, formatWait } from '../domain/alert-message.js';
import { normalizePhone } from '../domain/phone.js';
import { EscalationRepository } from '../infrastructure/escalation.repository.js';
import type { AlertRow, RulesRow } from '../infrastructure/escalations.schema.js';
import { NotifierError, type Notifier } from './notifier.port.js';

const DEFAULT_RULES: Pick<EscalationRules, 'manager' | 'admin'> = {
  manager: { enabled: false, afterSeconds: 120, channel: EscalationChannel.SMS, recipientName: '', phone: '' },
  admin: { enabled: false, afterSeconds: 300, channel: EscalationChannel.SMS, recipientName: '', phone: '' },
};

/** Orders older than this are not escalated: after an outage, nobody should get texts about yesterday. */
const LOOKBACK_MS = 6 * 60 * 60_000;

const STEPS = [
  { key: 'manager', level: EscalationLevel.MANAGER },
  { key: 'admin', level: EscalationLevel.ADMIN },
] as const;

export interface EscalationServiceDeps {
  db: Database;
  outbox: Outbox;
  clock: Clock;
  notifier: Notifier;
  orders: Pick<OrderReadModel, 'listWaiting' | 'acceptanceOf'>;
  hotelNameOf(hotelId: string): Promise<string>;
  /** Base URL of the staff dashboard, for the link in each alert. */
  dashboardUrl: string;
  log: { warn(details: object, message: string): void; error(details: object, message: string): void };
}

/**
 * Texts the manager, then the admin, when nobody accepts an order in time.
 * `sweep()` runs every few seconds; each (order, level) is claimed in the
 * database before sending, so an alert goes out at most once.
 */
export class EscalationService {
  private sweeping = false;
  private readonly repository: EscalationRepository;

  constructor(private readonly deps: EscalationServiceDeps) {
    this.repository = new EscalationRepository(deps.db, deps.outbox);
  }

  async getRules(hotelId: string): Promise<EscalationRules> {
    const row = await this.repository.findRules(hotelId);
    return row ? toRules(row) : { ...DEFAULT_RULES, updatedAt: null };
  }

  async updateRules(actor: SignedInStaff, input: UpdateEscalationRulesInput): Promise<EscalationRules> {
    const manager = validateStep(input.manager, 'manager');
    const admin = validateStep(input.admin, 'admin');
    const row = await this.repository.saveRules({
      hotelId: actor.hotelId,
      manager,
      admin,
      updatedAt: this.deps.clock.now(),
      updatedByUserId: actor.id,
    });
    return toRules(row);
  }

  /** Sends a sample alert to the saved recipient, so the admin can check the number and the channel work. */
  async sendTest(actor: SignedInStaff, input: SendTestAlertInput): Promise<TestAlertResult> {
    const step = (await this.getRules(actor.hotelId))[input.level];
    const phone = normalizePhone(step.phone);
    if (!phone || !step.recipientName) {
      throw new ValidationError(`Save a name and phone number for the ${input.level} alert first`);
    }
    const message = `Test from ConciergeIQ: ${await this.deps.hotelNameOf(actor.hotelId)} will text ${step.recipientName} here when an order waits ${formatWait(step.afterSeconds)} without being accepted.`;
    try {
      await this.deps.notifier.send({ to: phone, channel: step.channel, text: message });
      return { status: EscalationAlertStatus.SENT, error: null, message };
    } catch (error) {
      return { status: EscalationAlertStatus.FAILED, error: describeFailure(error), message };
    }
  }

  async listAlerts(hotelId: string, days: number): Promise<EscalationAlert[]> {
    const since = new Date(this.deps.clock.now().getTime() - days * 24 * 60 * 60_000);
    const rows = await this.repository.listSince(hotelId, since, 200);
    const acceptance = await this.deps.orders.acceptanceOf(hotelId, [...new Set(rows.map((row) => row.orderId))]);
    return rows.map((row) => toAlert(row, acceptance.find((entry) => entry.orderId === row.orderId)));
  }

  /** Checks every hotel with alerts turned on. Safe to call concurrently and from several instances. */
  async sweep(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      const configured = await this.repository.listAllRules();
      let sent = 0;
      for (const row of configured) {
        for (const step of STEPS) {
          const rule = row[step.key];
          if (!rule.enabled) continue;
          sent += await this.escalateHotel(row.hotelId, step.level, rule);
        }
      }
      return sent;
    } finally {
      this.sweeping = false;
    }
  }

  private async escalateHotel(hotelId: string, level: EscalationLevel, rule: EscalationStep): Promise<number> {
    const now = this.deps.clock.now();
    const phone = normalizePhone(rule.phone);
    if (!phone) return 0;

    const waiting = await this.deps.orders.listWaiting(hotelId, {
      placedBefore: new Date(now.getTime() - rule.afterSeconds * 1000),
      placedAfter: new Date(now.getTime() - LOOKBACK_MS),
    });
    let sent = 0;
    for (const order of waiting) {
      if (await this.escalateOrder(hotelId, order, level, rule, phone, now)) sent += 1;
    }
    return sent;
  }

  private async escalateOrder(
    hotelId: string,
    order: WaitingOrder,
    level: EscalationLevel,
    rule: EscalationStep,
    phone: string,
    now: Date,
  ): Promise<boolean> {
    const waitedSeconds = Math.round((now.getTime() - order.createdAt.getTime()) / 1000);
    const alertId = await this.repository.claim({
      hotelId,
      orderId: order.id,
      orderNumber: order.number,
      roomNumber: order.roomNumber,
      level,
      channel: rule.channel,
      recipientName: rule.recipientName,
      phone,
      waitedSeconds,
      sentAt: now,
    });
    if (!alertId) return false;

    const managerAlerted =
      level === EscalationLevel.ADMIN && (await this.repository.wasDelivered(order.id, EscalationLevel.MANAGER));

    const text = alertMessage({
      hotelName: await this.deps.hotelNameOf(hotelId),
      roomNumber: order.roomNumber,
      orderNumber: order.number,
      itemsSummary: order.itemsSummary,
      waitedSeconds,
      managerAlerted,
      link: `${this.deps.dashboardUrl.replace(/\/+$/, '')}/orders?order=${order.id}`,
    });

    let status: EscalationAlertStatus = EscalationAlertStatus.SENT;
    let error: string | null = null;
    let providerMessageId: string | null = null;
    try {
      providerMessageId = (await this.deps.notifier.send({ to: phone, channel: rule.channel, text })).messageId;
    } catch (caught) {
      status = EscalationAlertStatus.FAILED;
      error = describeFailure(caught);
      this.deps.log.warn({ orderId: order.id, level, error }, 'Escalation alert failed');
    }

    await this.repository.complete(alertId, { status, error, providerMessageId }, {
      eventName: 'order.escalated',
      hotelId,
      occurredAt: now.toISOString(),
      actor: { type: 'system' },
      orderId: order.id,
      orderNumber: order.number,
      roomNumber: order.roomNumber,
      level,
      channel: rule.channel,
      recipientName: rule.recipientName,
      waitedSeconds,
      delivered: status === EscalationAlertStatus.SENT,
    });
    return status === EscalationAlertStatus.SENT;
  }
}

function validateStep(step: EscalationStep, role: 'manager' | 'admin'): EscalationStep {
  const recipientName = step.recipientName.trim();
  const phone = step.phone.trim() ? normalizePhone(step.phone) : '';
  if (phone === null) {
    throw new ValidationError(`The ${role} phone number is not valid. Use +234… or 080…`);
  }
  if (step.enabled && (!recipientName || !phone)) {
    throw new ValidationError(`Add a name and phone number for the ${role} alert, or turn it off`);
  }
  return { ...step, recipientName, phone };
}

function describeFailure(error: unknown): string {
  return error instanceof NotifierError ? error.message : 'The message could not be sent';
}

function toRules(row: RulesRow): EscalationRules {
  return { manager: row.manager, admin: row.admin, updatedAt: row.updatedAt.toISOString() };
}

function toAlert(
  row: AlertRow,
  acceptance: { status: string; acceptedAt: Date | null } | undefined,
): EscalationAlert {
  const placedAt = row.sentAt.getTime() - row.waitedSeconds * 1000;
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    roomNumber: row.roomNumber,
    level: row.level as EscalationLevel,
    channel: row.channel,
    recipientName: row.recipientName,
    status: row.status,
    error: row.error,
    sentAt: row.sentAt.toISOString(),
    acceptedAfterSeconds: acceptance?.acceptedAt ? Math.round((acceptance.acceptedAt.getTime() - placedAt) / 1000) : null,
    orderStatus: acceptance?.status ?? 'UNKNOWN',
  };
}
