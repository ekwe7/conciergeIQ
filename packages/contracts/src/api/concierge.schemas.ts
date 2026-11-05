import { z } from 'zod';
import { LanguageSchema, type Language } from '../languages.js';

/** A piece of hotel-approved information the AI concierge may answer from. */
export const SaveKnowledgeArticleSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
  isPublished: z.boolean().default(true),
});
export type SaveKnowledgeArticleInput = z.infer<typeof SaveKnowledgeArticleSchema>;

export interface KnowledgeArticle {
  id: string;
  title: string;
  body: string;
  isPublished: boolean;
  updatedAt: string;
  updatedBy: string;
}

export const MAX_CONCIERGE_TURNS = 12;

/** The guest's conversation so far; the guest app keeps it, the server keeps nothing. */
export const ConciergeMessageSchema = z.object({
  language: LanguageSchema.default('en'),
  messages: z
    .array(z.object({ role: z.enum(['guest', 'concierge']), text: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(MAX_CONCIERGE_TURNS * 2)
    .refine((messages) => messages[messages.length - 1]?.role === 'guest', {
      message: 'The last message must be from the guest',
    }),
});
export type ConciergeMessageInput = z.infer<typeof ConciergeMessageSchema>;

/** An order the concierge suggests. It is never sent until the guest confirms it in the app. */
export interface ConciergeDraft {
  items: { itemId: string; name: string; quantity: number; unitPrice: number; note: string | null }[];
  deliveryNote: string | null;
  /** Estimated from today's prices; the order is priced again by the server when placed. */
  estimatedTotal: number;
}

export interface ConciergeReply {
  language: Language;
  reply: string;
  /** The approved articles the answer came from. */
  sources: { id: string; title: string }[];
  draft: ConciergeDraft | null;
  /** True when the concierge could not help and the guest should call the front desk. */
  handOffToDesk: boolean;
}
