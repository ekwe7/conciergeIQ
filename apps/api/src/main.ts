import { buildApp } from './app.js';
import { env } from './config/index.js';

async function main() {
  const { server } = await buildApp();

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    server.log.info(`Server running at http://localhost:${env.PORT}`);
    server.log.info(`Health check available at http://localhost:${env.PORT}/api/health`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
      await server.close();
      process.exit(0);
    });
  }
}

main();
