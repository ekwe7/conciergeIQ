import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { ConciergeUnavailableError, type ConciergeModel, type ConciergeTurn, type ModelAnswer } from '../application/concierge-model.port.js';
import { CONCIERGE_INSTRUCTIONS, knowledgeBlock, menuBlock, type ConciergeContext } from '../domain/prompt.js';

const AnswerSchema = z.object({
  reply: z.string(),
  sourceArticleIds: z.array(z.string()),
  handOffToDesk: z.boolean(),
  draftItems: z.array(z.object({ itemId: z.string(), quantity: z.number().int(), note: z.string() })),
  deliveryNote: z.string(),
});

export interface ClaudeConciergeOptions {
  apiKey: string;
  model: string;
  log: { warn(details: object, message: string): void };
  client?: Anthropic;
}

/** The concierge on Claude: one structured-output request per guest message. */
export class ClaudeConciergeModel implements ConciergeModel {
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeConciergeOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey, timeout: 30_000, maxRetries: 1 });
  }

  async answer(context: ConciergeContext, conversation: ConciergeTurn[]): Promise<ModelAnswer | null> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.options.model,
        max_tokens: 16000,
        // Chat replies: low effort keeps answers quick and inexpensive.
        output_config: { effort: 'low', format: betaZodOutputFormat(AnswerSchema) },
        // If the model declines, the API retries on a fallback model in the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [
          { type: 'text', text: CONCIERGE_INSTRUCTIONS },
          // The hotel's articles change rarely: cache everything up to here.
          { type: 'text', text: knowledgeBlock(context), cache_control: { type: 'ephemeral' } },
          { type: 'text', text: menuBlock(context) },
        ],
        messages: conversation.map((turn) => ({
          role: turn.role === 'guest' ? ('user' as const) : ('assistant' as const),
          content: turn.text,
        })),
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        this.options.log.warn({ status: error.status, type: error.name }, 'Concierge model request failed');
      } else {
        this.options.log.warn({ error: String(error) }, 'Concierge model request failed');
      }
      throw new ConciergeUnavailableError();
    }

    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
    const answer = response.parsed_output;
    return {
      reply: answer.reply,
      sourceArticleIds: answer.sourceArticleIds,
      handOffToDesk: answer.handOffToDesk,
      draft: { items: answer.draftItems, deliveryNote: answer.deliveryNote },
    };
  }
}
