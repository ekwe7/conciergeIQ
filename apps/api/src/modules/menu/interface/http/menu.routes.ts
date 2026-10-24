import {
  CreateMenuCategorySchema,
  CreateMenuItemSchema,
  SetItemAvailabilitySchema,
  UpdateMenuCategorySchema,
  UpdateMenuItemSchema,
} from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { MenuService } from '../../application/menu.service.js';

const CategoryParamsSchema = z.object({ categoryId: z.string().uuid() });
const ItemParamsSchema = z.object({ itemId: z.string().uuid() });

export function registerMenuRoutes(app: FastifyInstance, menu: MenuService, guards: AuthGuards): void {
  const tags = ['Menu'];
  const canView = { schema: { tags }, preHandler: guards.requirePermission(Permission.VIEW_MENU) };
  const canEdit = { schema: { tags }, preHandler: guards.requirePermission(Permission.EDIT_MENU) };
  const canMarkUnavailable = {
    schema: { tags },
    preHandler: guards.requirePermission(Permission.MARK_ITEMS_UNAVAILABLE),
  };

  app.get('/menu', canView, async (request) => menu.getMenu(request.staff.hotelId));

  app.post('/menu/categories', canEdit, async (request, reply) => {
    const category = await menu.createCategory(request.staff.hotelId, parseInput(CreateMenuCategorySchema, request.body));
    return reply.status(201).send(category);
  });

  app.patch('/menu/categories/:categoryId', canEdit, async (request) => {
    const { categoryId } = parseInput(CategoryParamsSchema, request.params);
    return menu.updateCategory(request.staff.hotelId, categoryId, parseInput(UpdateMenuCategorySchema, request.body));
  });

  app.delete('/menu/categories/:categoryId', canEdit, async (request, reply) => {
    const { categoryId } = parseInput(CategoryParamsSchema, request.params);
    await menu.deleteCategory(request.staff.hotelId, categoryId);
    return reply.status(204).send();
  });

  app.post('/menu/items', canEdit, async (request, reply) => {
    const item = await menu.createItem(request.staff.hotelId, parseInput(CreateMenuItemSchema, request.body));
    return reply.status(201).send(item);
  });

  app.patch('/menu/items/:itemId', canEdit, async (request) => {
    const { itemId } = parseInput(ItemParamsSchema, request.params);
    return menu.updateItem(request.staff.hotelId, itemId, parseInput(UpdateMenuItemSchema, request.body));
  });

  app.delete('/menu/items/:itemId', canEdit, async (request, reply) => {
    const { itemId } = parseInput(ItemParamsSchema, request.params);
    await menu.deleteItem(request.staff.hotelId, itemId);
    return reply.status(204).send();
  });

  app.patch('/menu/items/:itemId/availability', canMarkUnavailable, async (request) => {
    const { itemId } = parseInput(ItemParamsSchema, request.params);
    const { isAvailable } = parseInput(SetItemAvailabilitySchema, request.body);
    return menu.setAvailability(request.staff, itemId, isAvailable);
  });
}
