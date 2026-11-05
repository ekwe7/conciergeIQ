import type { Hotel, HotelBranding, UpdateBrandingInput, UpdateHotelInput, UploadLogoInput } from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { checkLogo } from '../domain/logo.js';
import { HotelRepository } from '../infrastructure/hotel.repository.js';
import type { HotelRow } from '../infrastructure/hotels.schema.js';

export interface NewHotel {
  name: string;
  address?: string;
  timezone: string;
  currency: string;
}

const DEFAULT_HEADLINE = 'Welcome to Room {room}';

/** Path of the public logo URL, relative to the API origin. The version busts caches when it changes. */
function logoPath(row: HotelRow): string | null {
  if (!row.logoData || !row.logoUpdatedAt) return null;
  return `/api/v1/hotels/${row.id}/logo?v=${row.logoUpdatedAt.getTime()}`;
}

function toBranding(row: HotelRow): HotelBranding {
  return {
    hotelId: row.id,
    hotelName: row.name,
    logoUrl: logoPath(row),
    brandColor: row.brandColor,
    accentColor: row.accentColor,
    welcomeHeadline: { en: DEFAULT_HEADLINE, ...row.welcomeHeadline },
    languages: row.languages,
  };
}

export interface HotelLogo {
  contentType: string;
  bytes: Buffer;
  updatedAt: Date;
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

  async getBranding(hotelId: string): Promise<HotelBranding> {
    return toBranding(await this.require(hotelId));
  }

  async updateBranding(hotelId: string, changes: UpdateBrandingInput): Promise<HotelBranding> {
    const { welcomeHeadline, languages, brandColor, accentColor } = changes;
    const row = await this.hotels.update(hotelId, {
      ...(brandColor && { brandColor: brandColor.toUpperCase() }),
      ...(accentColor && { accentColor: accentColor.toUpperCase() }),
      ...(languages && { languages: [...new Set(languages)] }),
      // Empty headlines fall back to the default text rather than showing nothing.
      ...(welcomeHeadline && {
        welcomeHeadline: Object.fromEntries(Object.entries(welcomeHeadline).filter(([, text]) => text.trim() !== '')),
      }),
    });
    if (!row) throw new NotFoundError('Hotel');
    return toBranding(row);
  }

  async setLogo(hotelId: string, upload: UploadLogoInput, now: Date): Promise<HotelBranding> {
    const check = checkLogo(upload);
    if (!check.ok) throw new ValidationError(check.reason);
    const row = await this.hotels.update(hotelId, {
      logoData: check.bytes.toString('base64'),
      logoContentType: upload.contentType,
      logoUpdatedAt: now,
    });
    if (!row) throw new NotFoundError('Hotel');
    return toBranding(row);
  }

  async removeLogo(hotelId: string): Promise<HotelBranding> {
    const row = await this.hotels.update(hotelId, { logoData: null, logoContentType: null, logoUpdatedAt: null });
    if (!row) throw new NotFoundError('Hotel');
    return toBranding(row);
  }

  async getLogo(hotelId: string): Promise<HotelLogo | undefined> {
    const row = await this.hotels.findById(hotelId);
    if (!row?.logoData || !row.logoContentType || !row.logoUpdatedAt) return undefined;
    return { contentType: row.logoContentType, bytes: Buffer.from(row.logoData, 'base64'), updatedAt: row.logoUpdatedAt };
  }

  private async require(hotelId: string): Promise<HotelRow> {
    const row = await this.hotels.findById(hotelId);
    if (!row) throw new NotFoundError('Hotel');
    return row;
  }
}
