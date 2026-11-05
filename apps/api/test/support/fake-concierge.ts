import type { ConciergeContext, ConciergeModel, ConciergeTurn, ModelAnswer } from '../../src/modules/concierge/index.js';
import { ConciergeUnavailableError } from '../../src/modules/concierge/index.js';

type Script = (context: ConciergeContext, conversation: ConciergeTurn[]) => ModelAnswer | null | 'unavailable';

/** Stands in for Claude: records what it was shown and answers from a script. */
export class FakeConciergeModel implements ConciergeModel {
  readonly calls: { context: ConciergeContext; conversation: ConciergeTurn[] }[] = [];
  script: Script = () => null;

  async answer(context: ConciergeContext, conversation: ConciergeTurn[]): Promise<ModelAnswer | null> {
    this.calls.push({ context, conversation });
    const result = this.script(context, conversation);
    if (result === 'unavailable') throw new ConciergeUnavailableError();
    return result;
  }

  reset(): void {
    this.calls.length = 0;
    this.script = () => null;
  }
}

export const answer = (overrides: Partial<ModelAnswer> = {}): ModelAnswer => ({
  reply: 'Happy to help.',
  sourceArticleIds: [],
  handOffToDesk: false,
  draft: { items: [], deliveryNote: '' },
  ...overrides,
});
