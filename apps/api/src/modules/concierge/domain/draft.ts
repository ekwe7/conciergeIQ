import type { ConciergeDraft, GuestMenu } from '@conciergeiq/contracts';

export interface ProposedDraft {
  items: { itemId: string; quantity: number; note: string }[];
  deliveryNote: string;
}

const MAX_QUANTITY = 10;
const MAX_LINES = 10;

/**
 * Turns what the model proposed into a draft the guest can confirm. Anything
 * not on the menu, not orderable now, or out of range is dropped: the model's
 * output is never trusted on its own. Prices come from the menu, not the model.
 */
export function checkDraft(proposed: ProposedDraft, menu: GuestMenu): ConciergeDraft | null {
  const orderable = new Map(
    menu.categories.flatMap((category) => category.items).filter((item) => item.isAvailable).map((item) => [item.id, item]),
  );
  const lines = new Map<string, ConciergeDraft['items'][number]>();
  for (const line of proposed.items.slice(0, MAX_LINES)) {
    const item = orderable.get(line.itemId);
    const quantity = Math.trunc(line.quantity);
    if (!item || !(quantity >= 1)) continue;
    const existing = lines.get(item.id);
    lines.set(item.id, {
      itemId: item.id,
      name: item.name,
      quantity: Math.min(MAX_QUANTITY, (existing?.quantity ?? 0) + quantity),
      unitPrice: item.price,
      note: line.note.trim().slice(0, 255) || existing?.note || null,
    });
  }
  if (lines.size === 0) return null;

  const items = [...lines.values()];
  return {
    items,
    deliveryNote: proposed.deliveryNote.trim().slice(0, 500) || null,
    estimatedTotal: Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100,
  };
}
