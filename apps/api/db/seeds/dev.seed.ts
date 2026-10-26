import type { Room } from '@conciergeiq/contracts';
import { buildApp } from '../../src/app.js';
import { DEMO_PASSWORD, seedDemoHotel } from './demo-hotel.seed.js';

/** `pnpm db:seed`: loads the demo hotel into the local database and prints how to try it. */
async function main() {
  const app = await buildApp({ dispatchEventsEveryMs: false });
  try {
    if (await app.modules.identity.users.hasAccount('admin@demo-hotel.test')) {
      console.log('The demo hotel is already loaded. Drop the database and migrate again to start fresh.');
      return;
    }
    const { rooms } = await seedDemoHotel(app);
    await app.events.dispatchPending();
    printWelcome(rooms);
  } finally {
    await app.server.close();
  }
}

function printWelcome(rooms: Room[]) {
  console.log('\nAzure Bay Hotel is ready.\n');
  for (const room of rooms) {
    const note = room.isOutOfOrder ? ' (out of order)' : '';
    console.log(`  Room ${room.number}${note}  ->  ${room.qrUrl}`);
  }
  console.log(`\nSign in with admin@, manager@, reception@ or kitchen@demo-hotel.test and the password ${DEMO_PASSWORD}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
