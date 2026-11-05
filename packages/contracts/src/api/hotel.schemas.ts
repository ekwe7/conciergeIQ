import { z } from 'zod';
import { LanguageSchema, type Language } from '../languages.js';

export const UpdateHotelSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(255),
    timezone: z.string().trim().min(1).max(50),
    currency: z.string().trim().length(3).toUpperCase(),
  })
  .partial();
export type UpdateHotelInput = z.infer<typeof UpdateHotelSchema>;

export interface Hotel {
  id: string;
  name: string;
  address: string;
  timezone: string;
  currency: string;
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour, e.g. #1B2A3A');

export const UpdateBrandingSchema = z
  .object({
    brandColor: hexColor,
    accentColor: hexColor,
    /** Per language; `{room}` is replaced with the guest's room number. */
    welcomeHeadline: z.record(LanguageSchema, z.string().trim().max(80)),
    languages: z.array(LanguageSchema).min(1),
  })
  .partial()
  .refine((branding) => !branding.languages || branding.languages.includes('en'), {
    message: 'English stays on as the default language',
    path: ['languages'],
  });
export type UpdateBrandingInput = z.infer<typeof UpdateBrandingSchema>;

export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export const MAX_LOGO_BYTES = 256 * 1024;

export const UploadLogoSchema = z.object({
  contentType: z.enum(LOGO_CONTENT_TYPES),
  /** The image file, base64-encoded. */
  data: z.string().min(1).max(Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 4),
});
export type UploadLogoInput = z.infer<typeof UploadLogoSchema>;

/** What the guest app needs to look like the hotel. Public: nothing here is secret. */
export interface HotelBranding {
  hotelId: string;
  hotelName: string;
  /** Null when the hotel has not uploaded a logo; show its initials instead. */
  logoUrl: string | null;
  brandColor: string;
  accentColor: string;
  welcomeHeadline: Partial<Record<Language, string>>;
  languages: Language[];
}
