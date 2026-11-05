import { SendTestAlertSchema, UpdateEscalationRulesSchema } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { EscalationService } from '../../application/escalation.service.js';

const AlertsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) });

export function registerEscalationsRoutes(app: FastifyInstance, escalations: EscalationService, guards: AuthGuards): void {
  const tags = ['Escalations'];
  // Rules hold staff phone numbers, so only admins read or change them.
  const canManage = { schema: { tags }, preHandler: guards.requirePermission(Permission.MANAGE_HOTEL_SETTINGS) };
  const canView = { schema: { tags }, preHandler: guards.requirePermission(Permission.VIEW_ACTIVITY_LOG) };

  app.get('/escalations/rules', canManage, async (request) => escalations.getRules(request.staff.hotelId));

  app.put('/escalations/rules', canManage, async (request) =>
    escalations.updateRules(request.staff, parseInput(UpdateEscalationRulesSchema, request.body)),
  );

  app.post('/escalations/test', canManage, async (request) =>
    escalations.sendTest(request.staff, parseInput(SendTestAlertSchema, request.body)),
  );

  app.get('/escalations/alerts', canView, async (request) => {
    const { days } = parseInput(AlertsQuerySchema, request.query);
    return escalations.listAlerts(request.staff.hotelId, days);
  });
}
