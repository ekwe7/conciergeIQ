import type {
  ConciergeMessageInput,
  ConciergeReply,
  GuestMenu,
  KnowledgeArticle,
  Language,
  SaveKnowledgeArticleInput,
} from '@conciergeiq/contracts';
import type { Database } from '../../../shared/db/client.js';
import { AppError, ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import type { Clock } from '../../../shared/utils/clock.js';
import type { SignedInStaff } from '../../identity/index.js';
import { checkDraft } from '../domain/draft.js';
import { RateWindow } from '../domain/rate-window.js';
import { ArticleRepository } from '../infrastructure/article.repository.js';
import type { ArticleRow } from '../infrastructure/concierge.schema.js';
import { ConciergeUnavailableError, type ConciergeModel } from './concierge-model.port.js';

export const MAX_ARTICLES = 40;

/** What a verified guest session tells the concierge. */
export interface ConciergeGuest {
  sessionId: string;
  hotelId: string;
  roomNumber: string;
}

export interface HotelFacts {
  name: string;
  timezone: string;
  currency: string;
  languages: Language[];
}

export interface ConciergeServiceDeps {
  db: Database;
  clock: Clock;
  /** Null when no model is configured: guests are told to call the desk. */
  model: ConciergeModel | null;
  hotelOf(hotelId: string): Promise<HotelFacts>;
  guestMenu(hotelId: string, language: Language): Promise<GuestMenu>;
}

/** Shown when the concierge cannot help. Translations live in the guest app; this is the API's fallback. */
const CALL_THE_DESK = "I can't help with that here. Please call the front desk from your room phone.";

export class ConciergeTooBusyError extends AppError {
  constructor() {
    super(429, 'TOO_MANY_REQUESTS', 'Too many messages. Wait a few minutes, or call the front desk.', { retryAfter: 60 });
  }
}

export class ConciergeService {
  private readonly articles: ArticleRepository;
  private readonly perSession = new RateWindow(20, 10 * 60_000);

  constructor(private readonly deps: ConciergeServiceDeps) {
    this.articles = new ArticleRepository(deps.db);
  }

  get isEnabled(): boolean {
    return this.deps.model !== null;
  }

  async listArticles(hotelId: string): Promise<KnowledgeArticle[]> {
    return (await this.articles.list(hotelId)).map(toArticle);
  }

  async createArticle(actor: SignedInStaff, input: SaveKnowledgeArticleInput): Promise<KnowledgeArticle> {
    if ((await this.articles.count(actor.hotelId)) >= MAX_ARTICLES) {
      throw new ConflictError(`A hotel can have up to ${MAX_ARTICLES} articles. Combine or remove some first.`);
    }
    const row = await this.articles.create({
      hotelId: actor.hotelId,
      ...input,
      updatedAt: this.deps.clock.now(),
      updatedBy: actor.fullName,
    });
    return toArticle(row);
  }

  async updateArticle(actor: SignedInStaff, articleId: string, input: SaveKnowledgeArticleInput): Promise<KnowledgeArticle> {
    const row = await this.articles.update(actor.hotelId, articleId, {
      ...input,
      updatedAt: this.deps.clock.now(),
      updatedBy: actor.fullName,
    });
    if (!row) throw new NotFoundError('Article');
    return toArticle(row);
  }

  async deleteArticle(hotelId: string, articleId: string): Promise<void> {
    if (!(await this.articles.delete(hotelId, articleId))) throw new NotFoundError('Article');
  }

  /**
   * Answers one guest message. Never places an order: at most it returns a
   * draft, re-checked against the menu, that the guest confirms in the app.
   */
  async reply(guest: ConciergeGuest, input: ConciergeMessageInput): Promise<ConciergeReply> {
    const hotel = await this.deps.hotelOf(guest.hotelId);
    const language: Language = hotel.languages.includes(input.language) ? input.language : 'en';
    const handOff = (): ConciergeReply => ({ language, reply: CALL_THE_DESK, sources: [], draft: null, handOffToDesk: true });

    if (!this.deps.model) return handOff();
    if (!this.perSession.allow(guest.sessionId, this.deps.clock.now().getTime())) throw new ConciergeTooBusyError();

    const [articles, menu] = await Promise.all([
      this.articles.list(guest.hotelId, true),
      this.deps.guestMenu(guest.hotelId, language),
    ]);

    let answer;
    try {
      answer = await this.deps.model.answer(
        {
          hotelName: hotel.name,
          articles: articles.map(({ id, title, body }) => ({ id, title, body })),
          menu,
          localTime: localTime(this.deps.clock.now(), hotel.timezone),
          currency: hotel.currency,
          language,
        },
        input.messages,
      );
    } catch (error) {
      if (error instanceof ConciergeUnavailableError) return handOff();
      throw error;
    }
    if (!answer || !answer.reply.trim()) return handOff();

    // Only articles that exist and are published count as sources.
    const cited = new Set(answer.sourceArticleIds);
    const sources = articles.filter((article) => cited.has(article.id)).map(({ id, title }) => ({ id, title }));

    return {
      language,
      reply: answer.reply.trim().slice(0, 2000),
      sources,
      draft: checkDraft(answer.draft, menu),
      handOffToDesk: answer.handOffToDesk,
    };
  }
}

function toArticle(row: ArticleRow): KnowledgeArticle {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    isPublished: row.isPublished,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

function localTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
}
