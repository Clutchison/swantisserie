import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MAX_PLAYERS, shuffle } from 'engine';
import type { Platform, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CubeLinkError,
  DraftFullError,
  notOnPlatformSentence,
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
import { toPoolCard, PoolSnapshotService } from './pool-snapshot.service.js';
import { TurnsService } from './turns.service.js';
import {
  ScryfallClient,
  ScryfallRejectedSearchError,
  type ScryfallCard,
  type ScryfallSearchPage,
} from '../scryfall/scryfall-client.js';
import { SCRYFALL_GAME } from './platform.js';
import { CubeCobraClient } from '../cubecobra/cubecobra-client.js';
import { cubeIdFrom } from '../cubecobra/cube-link.js';
import { cubePrintings } from './cube-pool.js';

/** What defines a new draft's pool: a pool query or a cube link, as the organizer gave it. */
export type NewPoolSource = { poolQuery: string } | { cubeLink: string };

/** A cube as a draft keeps it, with a printing on the platform of each mainboard copy. */
interface CheckedCube {
  cubeId: string;
  cubeName: string;
  printings: ScryfallCard[];
}

export interface NewDraft {
  name: string;
  poolSource: NewPoolSource;
  picksPerPlayer: number;
  platform: Platform;
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
    private readonly cubeCobra: CubeCobraClient,
    private readonly snapshots: PoolSnapshotService,
    private readonly turns: TurnsService,
  ) {}

  /**
   * Saves a new draft in Lobby, organized by `organizerId`, with its pool
   * snapshot: complete straight away for a cube link, which the check has
   * already looked up every card of, and started in the background for a
   * pool query. Throws UnknownWebhookError if its webhook doesn't exist,
   * PoolQueryError or CubeLinkError if its pool source can't make a pool, and
   * ScryfallUnavailableError or CubeCobraUnavailableError if that can't be
   * checked.
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
    const { poolSource, ...fields } = draft;
    if ('cubeLink' in poolSource) {
      const { cubeId, cubeName, printings } = await this.checkCubeLink(
        poolSource.cubeLink,
        draft.platform,
      );
      // One statement, so the draft and its pool cards are saved together or not at all.
      return this.saveDraft({
        ...fields,
        cubeId,
        cubeName,
        organizerId,
        snapshotState: 'Complete',
        poolTotal: printings.length,
        pool: { createMany: { data: printings.map(toPoolCard) } },
      });
    }
    await this.checkPoolQuery(poolSource.poolQuery, draft.platform);
    const created = await this.saveDraft({
      ...fields,
      poolQuery: poolSource.poolQuery,
      organizerId,
    });
    await this.snapshots.start(created.id);
    return created;
  }

  private saveDraft(
    data: Prisma.DraftUncheckedCreateInput,
  ): Promise<DraftWithOrganizer> {
    return (
      this.prisma.draft
        .create({ data, ...WITH_ORGANIZER })
        // The webhook may have been removed while the pool source was being checked.
        .catch(rethrowMissingWebhook)
    );
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

  /** The cube the link names, once it is checked to make a pool on the platform. */
  private async checkCubeLink(
    cubeLink: string,
    platform: Platform,
  ): Promise<CheckedCube> {
    const cubeId = cubeIdFrom(cubeLink);
    if (!cubeId) {
      throw new CubeLinkError({
        error: 'not-a-cube-link',
        message: 'That isn’t a CubeCobra cube link.',
      });
    }
    const cube = await this.cubeCobra.cube(cubeId);
    if (!cube) {
      // CubeCobra answers the same for a private cube as for a missing one.
      throw new CubeLinkError({
        error: 'cube-not-found',
        message: 'No public cube on CubeCobra has that id.',
      });
    }
    if (cube.mainboard.length === 0) {
      throw new CubeLinkError({
        error: 'no-cards',
        message: 'This cube has no mainboard cards.',
      });
    }
    const { printings, missing } = await cubePrintings(
      this.scryfall,
      cube,
      platform,
    );
    if (missing.length > 0) {
      throw new CubeLinkError({
        error: 'not-on-platform',
        message: `${notOnPlatformSentence(missing.length, 'in this cube', platform)}.`,
        cards: missing,
        totalCards: missing.length,
      });
    }
    return { cubeId, cubeName: cube.name, printings };
  }

  private async checkPoolQuery(
    poolQuery: string,
    platform: Platform,
  ): Promise<void> {
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
    // also catch Arena cards that have a paper-only printing. Likewise MTGO.
    const notOnPlatform = await this.search(
      `(${poolQuery}) -in:${SCRYFALL_GAME[platform]}`,
    );
    if (notOnPlatform) {
      const { totalCards } = notOnPlatform;
      throw new PoolQueryError({
        error: 'not-on-platform',
        message: `${notOnPlatformSentence(totalCards, 'in this pool query', platform)}.`,
        cards: notOnPlatform.cards.map((card) => card.name),
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
