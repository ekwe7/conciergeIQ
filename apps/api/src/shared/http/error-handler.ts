import type { FastifyError, FastifyInstance } from 'fastify';
import { DomainRuleError } from '../domain/domain-rule-error.js';
import { AppError } from '../errors/app-error.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode === 429) {
        const retryAfterSeconds =
          (error as { retryAfterSeconds?: number }).retryAfterSeconds ?? 60;
        reply.header('Retry-After', String(retryAfterSeconds));
      }
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    if (error instanceof DomainRuleError) {
      return reply.status(409).send({ error: { code: 'RULE_VIOLATION', message: error.message } });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: error.message },
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
  });
}
