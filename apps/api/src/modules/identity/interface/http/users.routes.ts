import { CreateStaffUserSchema, UpdateStaffUserSchema } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../../../../shared/http/validation.js';
import type { StaffUsersService } from '../../application/staff-users.service.js';
import { Permission } from '../../domain/permissions.js';
import type { AuthGuards } from './auth-guards.js';

const UserParamsSchema = z.object({ userId: z.string().uuid() });

export function registerUserRoutes(app: FastifyInstance, users: StaffUsersService, guards: AuthGuards): void {
  const canManageStaff = { schema: { tags: ['Staff'] }, preHandler: guards.requirePermission(Permission.MANAGE_STAFF) };

  app.get('/users', canManageStaff, async (request) => {
    return users.list(request.staff);
  });

  app.post('/users', canManageStaff, async (request, reply) => {
    const created = await users.create(request.staff, parseInput(CreateStaffUserSchema, request.body));
    return reply.status(201).send(created);
  });

  app.patch('/users/:userId', canManageStaff, async (request) => {
    const { userId } = parseInput(UserParamsSchema, request.params);
    return users.update(request.staff, userId, parseInput(UpdateStaffUserSchema, request.body));
  });
}
