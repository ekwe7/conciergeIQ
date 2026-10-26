import type { Hotel, UpdateHotelInput } from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { HotelRepository } from '../infrastructure/hotel.repository.js';
import type { HotelRow } from '../infrastructure/hotels.schema.js';

export interface NewHotel {
  name: string;
  address?: string;
  timezone: string;
  currency: string;
}

function toHotel(row: HotelRow): Hotel {
  return { id: row.id, name: row.name, address: row.address, timezone: row.timezone, currency: row.currency };
}

export class HotelsService {
  private readonly hotels: HotelRepository;

  constructor(db: Database) {
    this.hotels = new HotelRepository(db);
  }

  /** Registers a new hotel. Only for hotel setup and the demo seed. */
  async create(hotel: NewHotel): Promise<Hotel> {
    return toHotel(await this.hotels.create(hotel));
  }

  async get(hotelId: string): Promise<Hotel> {
    const row = await this.hotels.findById(hotelId);
    if (!row) throw new NotFoundError('Hotel');
    return toHotel(row);
  }

  async update(hotelId: string, changes: UpdateHotelInput): Promise<Hotel> {
    const row = await this.hotels.update(hotelId, changes);
    if (!row) throw new NotFoundError('Hotel');
    return toHotel(row);
  }
}
