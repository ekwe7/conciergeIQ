import { buildApp } from './app.js';
import { env } from './config/index.js';

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server running at http://localhost:${env.PORT}`);
    app.log.info(`Health check available at http://localhost:${env.PORT}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
