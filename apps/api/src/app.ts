import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/index.js';
import { createAuditModule } from './modules/audit/index.js';
import { createHotelsModule } from './modules/hotels/index.js';
import { createIdentityModule } from './modules/identity/index.js';
import { createMenuModule } from './modules/menu/index.js';
import { createOrderingModule } from './modules/ordering/index.js';
import { createPaymentsModule } from './modules/payments/index.js';
import { createRealtimeModule } from './modules/realtime/index.js';
import { createRoomsModule, QRTokenService } from './modules/rooms/index.js';
import { createStaysModule } from './modules/stays/index.js';
import { createGuestAccessModule } from './modules/guest-access/index.js';
import { connectToDatabase } from './shared/db/client.js';
import { systemClock, type Clock } from './shared/utils/clock.js';
import { EventBus } from './shared/events/event-bus.js';
import { Outbox } from './shared/events/outbox.repository.js';
import { OutboxDispatcher } from './shared/events/outbox.dispatcher.js';
import { registerErrorHandler } from './shared/http/error-handler.js';

export interface AppOptions {
  databaseUrl?: string;
  clock?: Clock;
  /** How often to deliver outbox events. `false` leaves it to the caller (tests). */
  dispatchEventsEveryMs?: number | false;
}

const VERSION = '0.1.0';

/** Composition root: connects the database and event bus, and registers every module. */
export async function buildApp(options: AppOptions = {}) {
  const clock = options.clock ?? systemClock;
  const connection = connectToDatabase(options.databaseUrl ?? env.DATABASE_URL);
  const { db } = connection;

  const app = Fastify({ logger: loggerOptions() });
  await registerPlugins(app);
  registerErrorHandler(app);
  registerSystemRoutes(app);

  const bus = new EventBus();
  const outbox = new Outbox();
  const dispatcher = new OutboxDispatcher(db, bus, app.log);

  const identity = createIdentityModule({
    app,
    db,
    outbox,
    clock,
    accessTokenTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  });
  const { guards } = identity;
  const hotels = createHotelsModule({ db, guards });
  const rooms = createRoomsModule({
    db,
    outbox,
    clock,
    guards,
    guestAppUrl: env.GUEST_APP_URL,
    hotelNameOf: async (hotelId) => (await hotels.hotels.get(hotelId)).name,
  });
  const menu = createMenuModule({ db, outbox, clock, guards });
  const ordering = createOrderingModule({ db, outbox, bus, clock, guards, menuModule: menu });
  const stays = createStaysModule({
    db,
    outbox,
    clock,
    guards,
    findRoom: (hotelId, roomId) => rooms.rooms.findRoom(hotelId, roomId),
    orders: ordering.orders,
  });
  const payments = createPaymentsModule({ db, outbox, clock, guards, orders: ordering.orders });
  const audit = createAuditModule({ db, bus, guards });
  const realtime = createRealtimeModule({ bus, clock, staffFromAccessToken: identity.staffFromAccessToken });
  const qrTokenService = new QRTokenService(env.JWT_ACCESS_SECRET, clock);
  const guestAccess = createGuestAccessModule({
    eventBus: bus,
    clock,
    activeStayLookupPort: {
      findActiveStayForRoom: async (hotelId, roomId) => {
        const stay = await stays.stays.findActiveStayForRoom(hotelId, roomId);
        return stay ? { ...stay, hotelId } : undefined;
      },
    },
    qrTokenService,
    roomLookupPort: {
      findRoomById: async (hotelId, roomId) => {
        const room = await rooms.rooms.findRoom(hotelId, roomId);
        return room
          ? { id: room.id, hotelId: room.hotelId, number: room.number, isOutOfOrder: room.isOutOfOrder }
          : undefined;
      },
      findRoomByQrToken: async (qrToken) => {
        const room = await rooms.rooms.findRoomByQrToken(qrToken);
        return room
          ? { id: room.id, hotelId: room.hotelId, number: room.number, isOutOfOrder: room.isOutOfOrder }
          : undefined;
      },
    },
    signGuestToken: (claims) => app.jwt.sign(claims as any, { expiresIn: '2h' }),
    logger: app.log,
  });

  const httpModules = [identity, hotels, rooms, menu, ordering, stays, payments, audit, guestAccess];
  await app.register(
    async (api) => {
      for (const module of httpModules) module.registerRoutes(api);
    },
    { prefix: '/api/v1' },
  );
  realtime.registerRoutes(app);

  if (options.dispatchEventsEveryMs !== false) {
    dispatcher.start(options.dispatchEventsEveryMs ?? 250);
  }
  app.addHook('onClose', async () => {
    await dispatcher.stop();
    await connection.close();
  });

  return {
    server: app,
    db,
    events: dispatcher,
    modules: { identity, hotels, rooms, menu, ordering, stays, payments, audit, guestAccess },
  };
}

export type ConciergeApp = Awaited<ReturnType<typeof buildApp>>;

function loggerOptions() {
  if (env.NODE_ENV !== 'development') return { level: env.LOG_LEVEL };
  return {
    level: env.LOG_LEVEL,
    transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } },
  };
}

async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: [env.GUEST_APP_URL, env.DASHBOARD_APP_URL],
    credentials: true,
  });
  await app.register(fastifyJwt, { secret: env.JWT_ACCESS_SECRET });
  await app.register(fastifyWebsocket);

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'ConciergeIQ API',
        description: 'Multi-tenant Guest Experience CRM and Digital Concierge REST API',
        version: VERSION,
      },
      servers: [{ url: `http://localhost:${env.PORT}`, description: 'Current Environment' }],
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
      security: [{ bearerAuth: [] }],
      tags: [{ name: 'System', description: 'System health and diagnostic endpoints' }],
    },
  });
  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: false },
    staticCSP: true,
  });
}

function registerSystemRoutes(app: FastifyInstance): void {
  app.get(
    '/',
    {
      schema: {
        description: 'Root endpoint providing service status and documentation link',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' }, status: { type: 'string' }, docs: { type: 'string' } },
          },
        },
      },
    },
    async () => ({ message: 'Welcome to ConciergeIQ API', status: 'online', docs: '/docs' }),
  );

  app.get(
    '/api/health',
    {
      schema: {
        description: 'System health check and diagnostic information',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              version: { type: 'string' },
              timestamp: { type: 'string' },
              uptimeSeconds: { type: 'number' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      service: 'ConciergeIQ API',
      version: VERSION,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    }),
  );
}
