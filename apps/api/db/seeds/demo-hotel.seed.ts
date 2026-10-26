import { OrderStatus, PaymentMethod, StaffRole, type MenuItem, type Room, type Stay } from '@conciergeiq/contracts';
import type { ConciergeApp } from '../../src/app.js';
import type { SignedInStaff } from '../../src/modules/identity/index.js';

/** Local development only. Never use these accounts outside your machine. */
export const DEMO_PASSWORD = 'ChangeMe123!';

const HOTEL = { name: 'Azure Bay Hotel', address: 'Victoria Island, Lagos', timezone: 'Africa/Lagos', currency: 'NGN' };

const ACCOUNTS = [
  { role: StaffRole.ADMIN, fullName: 'Emmanuel Ekwe', email: 'admin@demo-hotel.test' },
  { role: StaffRole.MANAGER, fullName: 'Kemi Idowu', email: 'manager@demo-hotel.test' },
  { role: StaffRole.RECEPTIONIST, fullName: 'Amaka Obi', email: 'reception@demo-hotel.test' },
  { role: StaffRole.STAFF, fullName: 'Chidi Eze', email: 'kitchen@demo-hotel.test' },
] as const;

const ROOM_NUMBERS = ['101', '102', '103', '104', '105', '106', '107', '108', '201', '202', '203', '204', '205', '206', '207', '208'];

const MENU: Record<string, [name: string, price: number][]> = {
  Breakfast: [
    ['Full Nigerian breakfast', 9_000],
    ['Akara & pap', 4_500],
  ],
  Mains: [
    ['Jollof rice & grilled chicken', 8_500],
    ['Azure club burger', 9_200],
    ['Seafood pasta', 11_000],
    ['Fried rice & turkey', 8_800],
  ],
  'Soups & swallows': [
    ['Egusi & pounded yam', 8_600],
    ['Pepper soup', 7_500],
  ],
  Drinks: [
    ['Chapman', 2_400],
    ['Sparkling water', 1_500],
    ['Water', 500],
  ],
  Amenities: [
    ['Extra towels', 0],
    ['Toiletries', 0],
    ['Iron & board', 0],
  ],
};

const GUESTS: [roomNumber: string, guestName: string, nights: number][] = [
  ['101', 'Mr. Bello', 2],
  ['103', 'Ms. Adeyemi', 1],
  ['104', 'Mr. & Mrs. Okafor', 3],
  ['107', 'Dr. Nwosu', 2],
  ['201', 'Mr. Danjuma', 1],
  ['205', 'Ms. Hassan', 4],
];

export interface DemoHotel {
  rooms: Room[];
}

/** A hotel with staff, rooms, a menu, guests and orders in every state. Runs through the real services. */
export async function seedDemoHotel(app: ConciergeApp): Promise<DemoHotel> {
  const { hotels, identity, rooms, menu, stays, ordering, payments } = app.modules;

  const hotel = await hotels.hotels.create(HOTEL);
  const staff: Record<StaffRole, SignedInStaff> = {} as Record<StaffRole, SignedInStaff>;
  for (const account of ACCOUNTS) {
    const user = await identity.users.createAccount(hotel.id, { ...account, password: DEMO_PASSWORD });
    staff[account.role] = { id: user.id, hotelId: hotel.id, fullName: user.fullName, role: user.role };
  }
  const { ADMIN: admin, RECEPTIONIST: receptionist, STAFF: kitchen } = staff;

  const createdRooms = await rooms.rooms.create(
    hotel.id,
    ROOM_NUMBERS.map((number) => ({ number, floor: Number(number.charAt(0)) })),
  );
  const room = (number: string) => createdRooms.find((candidate) => candidate.number === number)!;
  await rooms.rooms.update(hotel.id, room('105').id, { isOutOfOrder: true, outOfOrderReason: 'AC repair' });

  const items: Record<string, MenuItem> = {};
  let sortOrder = 0;
  for (const [categoryName, categoryItems] of Object.entries(MENU)) {
    const category = await menu.menu.createCategory(hotel.id, { name: categoryName, sortOrder: sortOrder++ });
    for (const [name, price] of categoryItems) {
      items[name] = await menu.menu.createItem(hotel.id, { categoryId: category.id, name, price, isAvailable: true });
    }
  }
  await menu.menu.setAvailability(staff.MANAGER, items['Seafood pasta']!.id, false);

  const guestStays: Record<string, Stay> = {};
  for (const [roomNumber, guestName, nights] of GUESTS) {
    const expectedCheckOutAt = new Date(Date.now() + nights * 24 * 60 * 60 * 1000).toISOString();
    guestStays[roomNumber] = await stays.stays.checkIn(receptionist, room(roomNumber).id, { guestName, expectedCheckOutAt });
  }

  const order = (roomNumber: string, lines: [name: string, quantity: number][]) => {
    const stay = guestStays[roomNumber]!;
    return ordering.placeOrder.execute({
      hotelId: hotel.id,
      roomId: stay.roomId,
      roomNumber: stay.roomNumber,
      stayId: stay.id,
      items: lines.map(([name, quantity]) => ({ itemId: items[name]!.id, quantity })),
    });
  };
  const accept = (orderId: string) =>
    ordering.advanceOrder.execute({ actor: kitchen, orderId, toStatus: OrderStatus.IN_PROGRESS });
  const deliver = async (orderId: string) => {
    await accept(orderId);
    await ordering.advanceOrder.execute({ actor: kitchen, orderId, toStatus: OrderStatus.DELIVERED });
  };

  // One order in each column of the live board.
  const paidBreakfast = await order('104', [['Full Nigerian breakfast', 2]]);
  await deliver(paidBreakfast.id);
  await payments.payments.record(receptionist, paidBreakfast.id, { method: PaymentMethod.CARD });

  const unpaidPepperSoup = await order('201', [['Pepper soup', 1], ['Water', 1]]);
  await deliver(unpaidPepperSoup.id);

  const freeIron = await order('107', [['Iron & board', 1]]);
  await deliver(freeIron.id);

  const cancelled = await order('205', [['Azure club burger', 1]]);
  await ordering.cancelOrder.execute({ actor: kitchen, orderId: cancelled.id, reason: 'Guest changed mind' });

  const inProgress = await order('101', [['Jollof rice & grilled chicken', 1], ['Azure club burger', 1], ['Chapman', 2]]);
  await accept(inProgress.id);

  await order('103', [['Egusi & pounded yam', 1], ['Water', 1]]);
  await order('107', [['Extra towels', 2], ['Toiletries', 1]]);

  await rooms.rooms.regenerateQrCodes(admin, [room('103').id]);

  return { rooms: await rooms.rooms.list(hotel.id) };
}
