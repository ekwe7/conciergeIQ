import { z } from 'zod';

const price = z.number().nonnegative().max(10_000_000).multipleOf(0.01);

export const CreateMenuCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().default(0),
});
export type CreateMenuCategoryInput = z.infer<typeof CreateMenuCategorySchema>;

export const UpdateMenuCategorySchema = CreateMenuCategorySchema.partial();
export type UpdateMenuCategoryInput = z.infer<typeof UpdateMenuCategorySchema>;

export const CreateMenuItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  price,
  photoUrl: z.string().url().max(255).optional(),
  isAvailable: z.boolean().default(true),
});
export type CreateMenuItemInput = z.infer<typeof CreateMenuItemSchema>;

export const UpdateMenuItemSchema = CreateMenuItemSchema.partial();
export type UpdateMenuItemInput = z.infer<typeof UpdateMenuItemSchema>;

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
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
}

export interface GetMenuResponse {
  categories: MenuCategory[];
}
