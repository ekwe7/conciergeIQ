import { z } from 'zod';

export const MenuItemSchema = z.object({
  id: z.string().uuid(),
  hotelId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().nonnegative(),
  imageUrl: z.string().url().optional(),
  isAvailable: z.boolean().default(true),
  allergens: z.array(z.string()).default([]),
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

export const MenuCategorySchema = z.object({
  id: z.string().uuid(),
  hotelId: z.string().uuid(),
  name: z.string().min(1).max(50),
  sortOrder: z.number().int().default(0),
  items: z.array(MenuItemSchema).default([]),
});
export type MenuCategory = z.infer<typeof MenuCategorySchema>;

export const GetMenuResponseSchema = z.object({
  categories: z.array(MenuCategorySchema),
});
export type GetMenuResponse = z.infer<typeof GetMenuResponseSchema>;
