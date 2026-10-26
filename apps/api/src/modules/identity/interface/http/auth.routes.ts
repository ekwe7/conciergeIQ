import { RefreshSessionSchema, StaffLoginSchema } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../../../shared/http/validation.js';
import type { AuthService } from '../../application/auth.service.js';
import type { AuthGuards } from './auth-guards.js';

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService, guards: AuthGuards): void {
  app.post('/auth/login', { schema: { tags: ['Auth'] } }, async (request) => {
    return auth.signIn(parseInput(StaffLoginSchema, request.body));
  });

  app.post('/auth/refresh', { schema: { tags: ['Auth'] } }, async (request) => {
    const { refreshToken } = parseInput(RefreshSessionSchema, request.body);
    return auth.refresh(refreshToken);
  });

  app.post('/auth/logout', { schema: { tags: ['Auth'] } }, async (request, reply) => {
    const { refreshToken } = parseInput(RefreshSessionSchema, request.body);
    await auth.signOut(refreshToken);
    return reply.status(204).send();
  });

  app.get('/auth/me', { schema: { tags: ['Auth'] }, preHandler: guards.signedIn }, async (request) => {
    return request.staff;
  });
}
