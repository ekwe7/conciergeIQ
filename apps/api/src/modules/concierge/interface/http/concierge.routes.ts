import { ConciergeMessageSchema, SaveKnowledgeArticleSchema } from '@conciergeiq/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UnauthorizedError } from '../../../../shared/errors/app-error.js';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { ConciergeGuest, ConciergeService } from '../../application/concierge.service.js';

const ArticleParamsSchema = z.object({ articleId: z.string().uuid() });

export interface ConciergeRoutesDeps {
  concierge: ConciergeService;
  guards: AuthGuards;
  /** Verifies a guest's bearer token and that the session is still active (not checked out). */
  guestFromToken(token: string): Promise<ConciergeGuest | undefined>;
}

export function registerConciergeRoutes(app: FastifyInstance, { concierge, guards, guestFromToken }: ConciergeRoutesDeps): void {
  const tags = ['Concierge'];
  const canEdit = { schema: { tags }, preHandler: guards.requirePermission(Permission.MANAGE_CONCIERGE_CONTENT) };

  app.get('/concierge/articles', canEdit, async (request) => ({
    enabled: concierge.isEnabled,
    articles: await concierge.listArticles(request.staff.hotelId),
  }));

  app.post('/concierge/articles', canEdit, async (request, reply) => {
    const article = await concierge.createArticle(request.staff, parseInput(SaveKnowledgeArticleSchema, request.body));
    return reply.status(201).send(article);
  });

  app.put('/concierge/articles/:articleId', canEdit, async (request) => {
    const { articleId } = parseInput(ArticleParamsSchema, request.params);
    return concierge.updateArticle(request.staff, articleId, parseInput(SaveKnowledgeArticleSchema, request.body));
  });

  app.delete('/concierge/articles/:articleId', canEdit, async (request, reply) => {
    const { articleId } = parseInput(ArticleParamsSchema, request.params);
    await concierge.deleteArticle(request.staff.hotelId, articleId);
    return reply.status(204).send();
  });

  /** Guest app: one message in, one reply out. Requires the guest's session token from the QR scan. */
  app.post('/guest/concierge/messages', { schema: { tags } }, async (request) => {
    const guest = await authenticateGuest(request, guestFromToken);
    return concierge.reply(guest, parseInput(ConciergeMessageSchema, request.body));
  });
}

async function authenticateGuest(
  request: FastifyRequest,
  guestFromToken: ConciergeRoutesDeps['guestFromToken'],
): Promise<ConciergeGuest> {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const guest = token ? await guestFromToken(token) : undefined;
  if (!guest) throw new UnauthorizedError('Scan the QR code in your room to continue');
  return guest;
}
