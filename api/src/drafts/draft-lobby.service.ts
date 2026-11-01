import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MAX_PLAYERS, shuffle } from 'engine';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DraftFullError,
  PlayersChangedError,
  PoolQueryError,
  rethrowMissingWebhook,
  UnknownBotError,
  UnknownWebhookError,
} from './draft-errors.js';
import {
  type DraftEvent,
  EVENT_PLAYER,
  toEventPlayer,
} from './draft-events.js';
import { DraftLock, type LockedDraft } from './draft-lock.js';
import {
  type DraftWithOrganizer,
  WITH_ORGANIZER,
} from './draft-reads.service.js';
import { SEAT_ORDER } from './draft-shapes.js';
import { checkCanStart, seatPlayers } from './draft-start.js';
import { PoolSnapshotService } from './pool-snapshot.service.js';
import { TurnsService } from './turns.service.js';
import {
  ScryfallClient,
  ScryfallRejectedSearchError,
  type ScryfallSearchPage,
} from '../scryfall/scryfall-client.js';

export interface NewDraft {
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
  /** Where its announcements are posted; null for none. */
  webhookId: string | null;
}

/** Drafts as they are created, and everything done in their lobby. */
@Injectable()
export class DraftLobbyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: DraftLock,
    private readonly scryfall: ScryfallClient,
    private readonly snapshots: PoolSnapshotService,
    private readonly turns: TurnsService,
  ) {}

  /**
   * Saves a new draft in Lobby, organized by `organizerId`, and starts its
   * pool snapshot. Throws UnknownWebhookError if its webhook doesn't exist,
   * PoolQueryError if its pool query can't make a pool, and
   * ScryfallUnavailableError if that can't be checked.
   */
  async create(
    organizerId: string,
    draft: NewDraft,
  ): Promise<DraftWithOrganizer> {
    if (
      draft.webhookId !== null &&
      !(await this.prisma.webhook.findUnique({
        where: { id: draft.webhookId },
      }))
    ) {
      throw new UnknownWebhookError();
    }
    await this.checkPoolQuery(draft.poolQuery);
    const created = await this.prisma.draft
      .create({ data: { ...draft, organizerId }, ...WITH_ORGANIZER })
      // The webhook may have been removed while the pool query was being checked.
      .catch(rethrowMissingWebhook);
    await this.snapshots.start(created.id);
    return created;
  }

  /**
   * Adds the user to the draft's players; a no-op if they're already in.
   * Throws DraftStartedError once the draft has left Lobby.
   */
  async join(draftId: string, userId: string): Promise<void> {
    await this.lock.inLobby(draftId, async ({ tx }) => {
      await tx.player.createMany({
        data: { draftId, userId },
        skipDuplicates: true,
      });
    });
  }

  /**
   * Removes the user from the draft's players; a no-op if they're not in.
   * Throws DraftStartedError once the draft has left Lobby.
   */
  async leave(draftId: string, userId: string): Promise<void> {
    await this.lock.inLobby(draftId, async ({ tx }) => {
      await tx.player.deleteMany({ where: { draftId, userId } });
    });
  }

  /**
   * Adds a new bot to the draft's players, named after the highest-numbered
   * bot it has had. Throws DraftFullError if the draft has as many players
   * as it can, and DraftStartedError once it has left Lobby.
   */
  async addBot(draftId: string): Promise<void> {
    await this.lock.inLobby(draftId, async ({ tx }) => {
      const players = await tx.player.findMany({
        where: { draftId },
        select: { user: { select: { name: true, isBot: true } } },
      });
      if (players.length >= MAX_PLAYERS) throw new DraftFullError();
      const numbers = players
        .filter(({ user }) => user.isBot)
        .map(({ user }) => Number(user.name.replace(/^Bot /, '')) || 0);
      const user = await tx.user.create({
        data: {
          id: `bot:${randomUUID()}`,
          name: `Bot ${Math.max(0, ...numbers) + 1}`,
          isBot: true,
        },
      });
      await tx.player.create({ data: { draftId, userId: user.id } });
    });
  }

  /**
   * Removes the bot from the draft's players and deletes it. Throws
   * UnknownBotError if the draft has no such bot, and DraftStartedError
   * once it has left Lobby.
   */
  async removeBot(draftId: string, userId: string): Promise<void> {
    await this.lock.inLobby(draftId, async ({ tx }) => {
      const { count } = await tx.player.deleteMany({
        where: { draftId, userId, user: { isBot: true } },
      });
      if (count === 0) throw new UnknownBotError();
      // A bot only ever plays in the draft it was added to.
      await tx.user.delete({ where: { id: userId } });
    });
  }

  /**
   * Cancels the draft: it and everything belonging to it are gone for good.
   * Throws DraftStartedError once the draft has left Lobby.
   */
  async cancel(draftId: string): Promise<void> {
    await this.lock.inLobby(draftId, async ({ tx }) => {
      const bots = await tx.player.findMany({
        where: { draftId, user: { isBot: true } },
        select: { userId: true },
      });
      await tx.draft.delete({ where: { id: draftId } });
      // A bot only ever plays in the draft it was added to.
      await tx.user.deleteMany({
        where: { id: { in: bots.map((bot) => bot.userId) } },
      });
    });
  }

  /**
   * Seats the players in a random order. Throws DraftStartedError once the
   * draft has left Lobby.
   */
  async randomizeSeats(draftId: string): Promise<void> {
    await this.lock.inLobby(draftId, async (draft) => {
      const userIds = await this.seatOrder(draft);
      await seatPlayers(draft, shuffle(userIds));
    });
  }

  /**
   * Seats the players in the order of `userIds`, which must list each of
   * them once; throws PlayersChangedError if it doesn't. Throws
   * DraftStartedError once the draft has left Lobby.
   */
  async reorderSeats(draftId: string, userIds: string[]): Promise<void> {
    await this.lock.inLobby(draftId, async (draft) => {
      const players = new Set(await this.seatOrder(draft));
      // The controller has checked the ids are distinct.
      if (
        players.size !== userIds.length ||
        !userIds.every((userId) => players.has(userId))
      ) {
        throw new PlayersChangedError();
      }
      await seatPlayers(draft, userIds);
    });
  }

  /**
   * Moves the draft to Drafting with its seats as they are. Throws
   * StartRefusedError if it can't start yet, and DraftStartedError if it
   * already has.
   */
  async start(draftId: string): Promise<DraftEvent[]> {
    return this.lock.inLobby(draftId, async (draft) => {
      const { tx } = draft;
      const userIds = await this.seatOrder(draft);
      await checkCanStart(tx, draft, userIds.length);
      // Seats become 0..n-1 so the engine's seat indexes match them.
      await seatPlayers(draft, userIds);
      await draft.moveTo('Drafting');
      const seats = await tx.player.findMany({
        where: { draftId },
        orderBy: SEAT_ORDER,
        select: EVENT_PLAYER,
      });
      return [
        { type: 'started', seats: seats.map(toEventPlayer) },
        ...(await this.turns.cascade(draft)),
      ];
    });
  }

  /** The user ids of the draft's players, in seat order. */
  private async seatOrder({ tx, id: draftId }: LockedDraft): Promise<string[]> {
    const players = await tx.player.findMany({
      where: { draftId },
      orderBy: SEAT_ORDER,
      select: { userId: true },
    });
    return players.map((player) => player.userId);
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
      throw err;
    }
  }
}
