import { StaffRole, type MenuItem, type Room, type Stay } from '@conciergeiq/contracts';
import { sql } from 'drizzle-orm';
import { buildApp, type ConciergeApp } from '../../src/app.js';
import { StaffClient, callAnonymously } from './staff-client.js';
import { TestClock } from './test-clock.js';

export const TEST_PASSWORD = 'CorrectHorse1!';

const ALL_TABLES = [
  'platform.outbox_events',
  'audit.activity_log',
  'payments.payments',
  'ordering.order_status_log',
  'ordering.order_items',
  'ordering.orders',
  'stays.stays',
  'menu.items',
  'menu.categories',
  'rooms.rooms',
  'identity.refresh_tokens',
  'identity.users',
  'hotels.hotels',
];

/**
 * A real app on the test database, with a clock tests control and events
 * delivered only when a test asks. Start one per test file.
 */
export class TestWorld {
  private hotelCount = 0;

  private constructor(
    readonly app: ConciergeApp,
    readonly clock: TestClock,
  ) {}

  static async start(): Promise<TestWorld> {
    const clock = new TestClock();
    const app = await buildApp({ clock, dispatchEventsEveryMs: false });
    await app.server.ready();
    return new TestWorld(app, clock);
  }

  get server() {
    return this.app.server;
  }

  async reset(): Promise<void> {
    await this.app.db.execute(sql.raw(`truncate ${ALL_TABLES.join(', ')} restart identity cascade`));
    await this.app.db.execute(sql`alter sequence ordering.order_number_seq restart`);
  }

  async stop(): Promise<void> {
    await this.app.server.close();
  }

  /** Delivers recorded events to subscribers: the activity log, live dashboards, paid badges. */
  async deliverEvents(): Promise<void> {
    await this.app.events.dispatchPending();
  }

  /** Delivers every event again, as happens after a crash between handling and marking published. */
  async redeliverAllEvents(): Promise<void> {
    await this.app.db.execute(sql`update platform.outbox_events set published_at = null`);
    await this.deliverEvents();
  }

  /** A hotel with one signed-in account for each role. */
  async createHotel(name = 'Azure Bay Hotel'): Promise<HotelFixture> {
    const hotel = await this.app.modules.hotels.hotels.create({ name, timezone: 'Africa/Lagos', currency: 'NGN' });
    const emailDomain = `hotel${++this.hotelCount}.test`;

    const signInAs = async (role: StaffRole, fullName: string) => {
      const email = `${role.toLowerCase()}@${emailDomain}`;
      await this.app.modules.identity.users.createAccount(hotel.id, { fullName, email, role, password: TEST_PASSWORD });
      return this.signIn(email);
    };

    return new HotelFixture(this, hotel.id, hotel.name, {
      admin: await signInAs(StaffRole.ADMIN, 'Emmanuel Ekwe'),
      manager: await signInAs(StaffRole.MANAGER, 'Kemi Idowu'),
      receptionist: await signInAs(StaffRole.RECEPTIONIST, 'Amaka Obi'),
      staff: await signInAs(StaffRole.STAFF, 'Chidi Eze'),
    });
  }

  async signIn(email: string, password = TEST_PASSWORD): Promise<StaffClient> {
    const response = await callAnonymously(this.server, 'POST', '/auth/login', { email, password });
    if (response.status !== 200) throw new Error(`Sign-in failed for ${email}: ${JSON.stringify(response.body)}`);
    const { user, accessToken, refreshToken } = response.body;
    return new StaffClient(this.server, user, accessToken, refreshToken);
  }
}

export interface HotelStaff {
  admin: StaffClient;
  manager: StaffClient;
  receptionist: StaffClient;
  staff: StaffClient;
}

/** One hotel and shortcuts for the setup most tests need. Shortcuts go through the real API. */
export class HotelFixture {
  readonly admin: StaffClient;
  readonly manager: StaffClient;
  readonly receptionist: StaffClient;
  readonly staff: StaffClient;

  constructor(
    private readonly world: TestWorld,
    readonly id: string,
    readonly name: string,
    accounts: HotelStaff,
  ) {
    ({ admin: this.admin, manager: this.manager, receptionist: this.receptionist, staff: this.staff } = accounts);
  }

  async addRoom(number: string, floor = Number(number.charAt(0))): Promise<Room> {
    return expectStatus(201, await this.admin.post('/rooms', { number, floor }));
  }

  async addMenuItem(name: string, price: number, category = 'Mains'): Promise<MenuItem> {
    const menu = expectStatus(200, await this.manager.get('/menu'));
    const existing = menu.categories.find((candidate: { name: string }) => candidate.name === category);
    const categoryId = existing?.id ?? expectStatus(201, await this.manager.post('/menu/categories', { name: category })).id;
    return expectStatus(201, await this.manager.post('/menu/items', { categoryId, name, price }));
  }

  async checkIn(room: Room, guestName = 'Mr. Bello'): Promise<Stay> {
    const body = { guestName, expectedCheckOutAt: this.world.clock.daysFromNow(2) };
    return expectStatus(201, await this.receptionist.post(`/rooms/${room.id}/check-in`, body));
  }

  /** What a guest's phone would do. Guest sessions belong to another module, so this calls the use case. */
  async guestOrders(stay: Stay, items: { item: MenuItem; quantity?: number; notes?: string }[], idempotencyKey?: string) {
    return this.world.app.modules.ordering.placeOrder.execute({
      hotelId: this.id,
      roomId: stay.roomId,
      roomNumber: stay.roomNumber,
      stayId: stay.id,
      items: items.map(({ item, quantity = 1, notes }) => ({ itemId: item.id, quantity, notes })),
      idempotencyKey,
    });
  }

  /** A checked-in room with one pending order, the starting point for most order tests. */
  async pendingOrder(roomNumber = '101') {
    const room = await this.addRoom(roomNumber);
    const stay = await this.checkIn(room);
    const jollof = await this.addMenuItem(`Jollof rice ${roomNumber}`, 8500);
    const order = await this.guestOrders(stay, [{ item: jollof, quantity: 2 }]);
    return { room, stay, order };
  }

  async acceptAndDeliver(orderId: string): Promise<void> {
    expectStatus(200, await this.staff.patch(`/orders/${orderId}/status`, { status: 'IN_PROGRESS' }));
    expectStatus(200, await this.staff.patch(`/orders/${orderId}/status`, { status: 'DELIVERED' }));
  }
}

/** Fails setup loudly when a shortcut call does not do what the test expects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expectStatus(expected: number, response: { status: number; body: any }) {
  if (response.status !== expected) {
    throw new Error(`Expected ${expected} but got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body;
}
