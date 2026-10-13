import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Enable CORS
  await app.register(cors, {
    origin: [env.GUEST_APP_URL, env.DASHBOARD_APP_URL, 'http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
  });

  // Root endpoint
  app.get('/', async () => {
    return {
      message: 'Welcome to ConciergeIQ API',
      status: 'online',
      docs: '/api/health',
    };
  });

  // Health check endpoint
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      service: 'ConciergeIQ API',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  });

  return app;
}
