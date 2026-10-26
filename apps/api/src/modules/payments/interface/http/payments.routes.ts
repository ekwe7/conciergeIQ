import { PaymentsPeriodQuerySchema, RecordPaymentSchema } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toMajorUnits } from '../../../../shared/domain/money.js';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { PaymentsService } from '../../application/payments.service.js';

const OrderParamsSchema = z.object({ orderId: z.string().uuid() });

export function registerPaymentsRoutes(app: FastifyInstance, payments: PaymentsService, guards: AuthGuards): void {
  const canRecordPayments = {
    schema: { tags: ['Payments'] },
    preHandler: guards.requirePermission(Permission.RECORD_PAYMENTS),
  };

  app.post('/orders/:orderId/payments', canRecordPayments, async (request, reply) => {
    const { orderId } = parseInput(OrderParamsSchema, request.params);
    const payment = await payments.record(request.staff, orderId, parseInput(RecordPaymentSchema, request.body));
    return reply.status(201).send(payment);
  });

  app.get('/payments', canRecordPayments, async (request) => {
    const period = payments.periodFrom(parseInput(PaymentsPeriodQuerySchema, request.query));
    return payments.list(request.staff.hotelId, period);
  });

  app.get('/payments/summary', canRecordPayments, async (request) => {
    const period = payments.periodFrom(parseInput(PaymentsPeriodQuerySchema, request.query));
    return payments.summarize(request.staff.hotelId, period);
  });

  app.get('/payments/outstanding', canRecordPayments, async (request) => {
    const unpaid = await payments.listOutstanding(request.staff.hotelId);
    return unpaid.map((order) => ({
      orderId: order.id,
      orderNumber: order.number,
      roomNumber: order.roomNumber,
      amount: toMajorUnits(order.totalMinor),
    }));
  });
}
