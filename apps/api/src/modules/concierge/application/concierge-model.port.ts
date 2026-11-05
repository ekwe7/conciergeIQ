import type { ConciergeContext } from '../domain/prompt.js';
import type { ProposedDraft } from '../domain/draft.js';

export interface ModelAnswer {
  reply: string;
  sourceArticleIds: string[];
  handOffToDesk: boolean;
  draft: ProposedDraft;
}

export interface ConciergeTurn {
  role: 'guest' | 'concierge';
  text: string;
}

/**
 * Answers a guest from the hotel's context. Returns null when the model
 * declined or produced nothing usable; throws `ConciergeUnavailableError`
 * when it could not be reached.
 */
export interface ConciergeModel {
  answer(context: ConciergeContext, conversation: ConciergeTurn[]): Promise<ModelAnswer | null>;
}

export class ConciergeUnavailableError extends Error {
  constructor(message = 'The concierge is not available right now') {
    super(message);
    this.name = 'ConciergeUnavailableError';
  }
}
