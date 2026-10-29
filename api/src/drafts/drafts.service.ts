import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ScryfallClient,
  ScryfallRejectedSearchError,
  type ScryfallSearchPage,
} from '../scryfall/scryfall-client.js';

export interface NewDraft {
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
}

const WITH_ORGANIZER = {
  include: { organizer: { select: { id: true, name: true } } },
} satisfies Prisma.DraftDefaultArgs;

/** Why a pool query can't make a pool; sent to the organizer as is. */
export type PoolQueryProblem =
  | {
      error: 'not-on-arena';
      message: string;
      /** The first page of offending card names. */
      cards: string[];
      totalCards: number;
    }
  | { error: 'no-cards'; message: string }
  | {
      /** Scryfall couldn't run the query, or ignored some of its terms. */
      error: 'query-rejected';
      message: string;
      warnings: string[];
    };

export class PoolQueryError extends Error {
  constructor(readonly problem: PoolQueryProblem) {
    super(problem.message);
  }
}

/** Scryfall failed for reasons of its own, not the pool query's. */
export class ScryfallUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Scryfall search failed', { cause });
  }
}

export type DraftWithOrganizer = Prisma.DraftGetPayload<typeof WITH_ORGANIZER>;

@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scryfall: ScryfallClient,
  ) {}

  /**
   * Saves a new draft in Lobby, organized by `organizerId`. Throws
   * PoolQueryError if its pool query can't make a pool, and
   * ScryfallUnavailableError if that can't be checked.
   */
  async create(
    organizerId: string,
    draft: NewDraft,
  ): Promise<DraftWithOrganizer> {
    await this.checkPoolQuery(draft.poolQuery);
    return this.prisma.draft.create({
      data: { ...draft, organizerId },
      ...WITH_ORGANIZER,
    });
  }

  /** Every draft, newest first. */
  async list(): Promise<DraftWithOrganizer[]> {
    return this.prisma.draft.findMany({
      orderBy: { createdAt: 'desc' },
      ...WITH_ORGANIZER,
    });
  }

  private async checkPoolQuery(poolQuery: string): Promise<void> {
    const matches = await this.search(poolQuery);
    if (!matches) {
      throw new PoolQueryError({
        error: 'no-cards',
        message: 'This pool query matches no cards.',
      });
    }
    // An ignored term would quietly give a different pool than intended.
    if (matches.warnings.length > 0) {
      throw new PoolQueryError({
        error: 'query-rejected',
        message: 'Scryfall ignored part of this pool query.',
        warnings: matches.warnings,
      });
    }

    // in:arena, not game:arena: game: matches printings, so -game:arena would
    // also catch Arena cards that have a paper-only printing.
    const notOnArena = await this.search(`(${poolQuery}) -in:arena`);
    if (notOnArena) {
      const { totalCards } = notOnArena;
      throw new PoolQueryError({
        error: 'not-on-arena',
        message: `${totalCards} ${totalCards === 1 ? 'card' : 'cards'} in this pool query ${totalCards === 1 ? 'is' : 'are'} not on Arena.`,
        cards: notOnArena.cards.map((card) => card.name),
        totalCards,
      });
    }
  }

  private async search(query: string): Promise<ScryfallSearchPage | null> {
    try {
      return await this.scryfall.search(query);
    } catch (err) {
      if (err instanceof ScryfallRejectedSearchError) {
        throw new PoolQueryError({
          error: 'query-rejected',
          message: err.details,
          warnings: err.warnings,
        });
      }
      throw new ScryfallUnavailableError(err);
    }
  }
}
