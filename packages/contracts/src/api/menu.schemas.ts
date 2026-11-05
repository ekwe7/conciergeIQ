import { z } from 'zod';
import { TranslatedLanguageSchema, type Language } from '../languages.js';

const price = z.number().nonnegative().max(10_000_000).multipleOf(0.01);

/** A time of day in the hotel's time zone, "06:30". */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time, e.g. 06:30');

const CategoryTranslationsSchema = z.record(TranslatedLanguageSchema, z.object({ name: z.string().trim().max(80) }));
const ItemTranslationsSchema = z.record(
  TranslatedLanguageSchema,
  z.object({ name: z.string().trim().max(120), description: z.string().trim().max(500).optional() }),
);

const CategoryFields = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().default(0),
  /**
   * Service hours, e.g. breakfast 06:30–11:00 or late night 22:00–02:00.
   * Both null means the category is served all day.
   */
  availableFrom: timeOfDay.nullable().default(null),
  availableUntil: timeOfDay.nullable().default(null),
  translations: CategoryTranslationsSchema.default({}),
});

const hoursComplete = (category: { availableFrom?: string | null; availableUntil?: string | null }) =>
  category.availableFrom === undefined ||
  category.availableUntil === undefined ||
  (category.availableFrom === null) === (category.availableUntil === null);
const hoursMessage = { message: 'Set both the start and end time, or neither', path: ['availableUntil'] };

export const CreateMenuCategorySchema = CategoryFields.refine(hoursComplete, hoursMessage);
export type CreateMenuCategoryInput = z.infer<typeof CreateMenuCategorySchema>;

export const UpdateMenuCategorySchema = z
  .object({
    name: CategoryFields.shape.name,
    sortOrder: z.number().int(),
    availableFrom: timeOfDay.nullable(),
    availableUntil: timeOfDay.nullable(),
    translations: CategoryTranslationsSchema,
  })
  .partial()
  .refine(hoursComplete, hoursMessage);
export type UpdateMenuCategoryInput = z.infer<typeof UpdateMenuCategorySchema>;

const ItemFields = {
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  price,
  photoUrl: z.string().url().max(255).optional(),
  isAvailable: z.boolean(),
  /** Shown first to guests, e.g. the chef's special. */
  isFeatured: z.boolean(),
  /** Up to five items suggested with this one: "Add a drink?". */
  pairsWith: z.array(z.string().uuid()).max(5),
  translations: ItemTranslationsSchema,
};

export const CreateMenuItemSchema = z.object({
  ...ItemFields,
  isAvailable: ItemFields.isAvailable.default(true),
  isFeatured: ItemFields.isFeatured.default(false),
  pairsWith: ItemFields.pairsWith.default([]),
  translations: ItemFields.translations.default({}),
});
export type CreateMenuItemInput = z.infer<typeof CreateMenuItemSchema>;

export const UpdateMenuItemSchema = z.object(ItemFields).partial();
export type UpdateMenuItemInput = z.infer<typeof UpdateMenuItemSchema>;

export type CategoryTranslations = Partial<Record<Exclude<Language, 'en'>, { name: string }>>;
export type ItemTranslations = Partial<Record<Exclude<Language, 'en'>, { name: string; description?: string }>>;

export const SetItemAvailabilitySchema = z.object({ isAvailable: z.boolean() });
export type SetItemAvailabilityInput = z.infer<typeof SetItemAvailabilitySchema>;

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  photoUrl: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  pairsWith: string[];
  translations: ItemTranslations;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  availableFrom: string | null;
  availableUntil: string | null;
  /** Whether the category is being served right now, in the hotel's time zone. */
  isOpenNow: boolean;
  translations: CategoryTranslations;
  items: MenuItem[];
}

/** One item as a guest sees it: in their language, with what to suggest alongside it. */
export interface GuestMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  photoUrl: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  pairsWith: string[];
}

export interface GuestMenuCategory {
  id: string;
  name: string;
  availableFrom: string | null;
  availableUntil: string | null;
  isOpenNow: boolean;
  items: GuestMenuItem[];
}

export interface GuestMenu {
  language: Language;
  /** Featured items that can be ordered now, for the top of the menu. */
  featured: GuestMenuItem[];
  /** Categories being served now first, then the rest with their hours. */
  categories: GuestMenuCategory[];
}

export interface GetMenuResponse {
  categories: MenuCategory[];
}
