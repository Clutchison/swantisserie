import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NewPoolSourceRequest } from 'contract';
import { MAX_PLAYERS, shuffle } from 'engine';
import type { Platform, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CubeLinkError,
  DraftFullError,
  notOnPlatformMessage,
  PlayersChangedError,
  PoolQueryError,
  refuseUnchoosableWebhook,
  rethrowMissingWebhook,
  UnknownBotError,
  unidentifiedCardsMessage,
} from './draft-errors.js';
import {
  type DraftEvent,
  EVENT_PLAYER,
  toEventPlayer,
} from './draft-events.js';
import { isBasicLand, withoutBasicLands } from './basic-lands.js';
import { DraftLock, type LockedDraft, shareLockUser } from './draft-lock.js';
import {
  type DraftWithOrganizer,
  WITH_ORGANIZER,
} from './draft-reads.service.js';
import { SEAT_ORDER } from './draft-shapes.js';
import { checkCanStart, seatPlayers } from './draft-start.js';
import { toPoolCard } from './pool-card.js';
import { PoolSnapshotService } from './pool-snapshot.service.js';
import { TurnsService } from './turns.service.js';
import {
  ScryfallClient,
  ScryfallRejectedSearchError,
  ScryfallUnavailableError,
  type ScryfallCard,
  type ScryfallSearchPage,
} from '../scryfall/scryfall-client.js';
import { SCRYFALL_GAME } from './platform.js';
import {
  type CubeCard,
  CubeCobraClient,
  CubeCobraUnavailableError,
} from '../cubecobra/cubecobra-client.js';
import { cubeIdFrom } from '../cubecobra/cube-link.js';
import { cubePrintings } from './cube-pool.js';
import { STORED_POOL_SOURCE_KIND } from './pool-source.js';
import { SetCatalog } from '../sets/set-catalog.js';
import { Deadline, DeadlinePassedError } from '../deadline.js';

/**
 * How long draft creation waits on its outside checks, all told. Stays under
 * Heroku's 30 s router limit, with room left to save the draft and answer:
 * past the limit the router answers 503 while the draft is saved anyway.
 */
export const DRAFT_CREATION_DEADLINE_MS = 25_000;

/** A cube as a draft keeps it, with a printing on the platform of each mainboard copy. */
interface CheckedCube {
  cubeId: string;
  cubeName: string;
  printings: ScryfallCard[];
}

export interface NewDraft {
  name: string;
  /** As the organizer gave it, trimmed. */
  poolSource: NewPoolSourceRequest;
  picksPerPlayer: number;
  /** 0 for none. */
  doublePicks: number;
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
    private readonly sets: SetCatalog,
    private readonly snapshots: PoolSnapshotService,
    private readonly turns: TurnsService,
  ) {}

  /**
   * Saves a new draft in Lobby, organized by `organizerId`, with its pool
   * snapshot: complete straight away for a cube link, which the check has
   * already looked up every card of, and started in the background for a
   * pool query or a set list. Once the draft is saved, a snapshot that fails
   * to start doesn't fail creation: the draft is answered with its snapshot
   * Failed, for the organizer to retry. Throws UnknownWebhookError if its webhook
   * doesn't exist, GoneWebhookChosenError if it is gone, PoolQueryError,
   * CubeLinkError or SetNotOfferedError if its pool source can't make a pool,
   * and ScryfallUnavailableError or CubeCobraUnavailableError if that can't
   * be checked. Its outside checks share one deadline,
   * DRAFT_CREATION_DEADLINE_MS: a check still waiting on Scryfall or
   * CubeCobra when it passes fails with that service's unavailable error,
   * and nothing is saved, even if the check finishes later.
   */
  async create(
    organizerId: string,
    draft: NewDraft,
  ): Promise<DraftWithOrganizer> {
    await refuseUnchoosableWebhook(this.prisma, draft.webhookId);
    const deadline = new Deadline('draft creation', DRAFT_CREATION_DEADLINE_MS);
    const { poolSource, ...fields } = draft;
    const poolSourceKind = STORED_POOL_SOURCE_KIND[poolSource.kind];
    switch (poolSource.kind) {
      case 'pool-query': {
        await this.checkPoolQuery(
          poolSource.poolQuery,
          draft.platform,
          deadline,
        );
        return this.saveDraftAndStartSnapshot({
          ...fields,
          poolSourceKind,
          poolQuery: poolSource.poolQuery,
          organizerId,
        });
      }
      case 'cube': {
        const { cubeId, cubeName, printings } = await this.checkCubeLink(
          poolSource.cubeLink,
          draft.platform,
          deadline,
        );
        // One statement, so the draft and its pool cards are saved together or not at all.
        return this.saveDraft({
          ...fields,
          poolSourceKind,
          cubeId,
          cubeName,
          organizerId,
          snapshotState: 'Complete',
          poolTotal: printings.length,
          pool: { createMany: { data: printings.map(toPoolCard) } },
        });
      }
      case 'set-list': {
        const setList = await deadline.race(
          this.sets.check(draft.platform, poolSource.setList),
          () => scryfallTooSlow(deadline),
        );
        return this.saveDraftAndStartSnapshot({
          ...fields,
          poolSourceKind,
          setList: setList.map(({ code, sublists }) => ({ code, sublists })),
          organizerId,
        });
      }
      default: {
        const unhandled: never = poolSource;
        throw new Error(`Unknown pool source ${JSON.stringify(unhandled)}.`);
      }
    }
  }

  /**
   * Saves the draft, as saveDraft does, and starts its pool snapshot in the
   * background. Answers the draft with its snapshot as the start left it.
   */
  private async saveDraftAndStartSnapshot(
    data: Prisma.DraftUncheckedCreateInput,
  ): Promise<DraftWithOrganizer> {
    const created = await this.saveDraft(data);
    return {
      ...created,
      ...(await this.snapshots.startOrRecordFailure(created.id)),
    };
  }

  /** Saves the draft, showing its organizer as a sign-in in progress leaves them. */
  private saveDraft(
    data: Prisma.DraftUncheckedCreateInput,
  ): Promise<DraftWithOrganizer> {
    return (
      this.prisma
        .$transaction(async (tx) => {
          await shareLockUser(tx, data.organizerId);
          return tx.draft.create({ data, ...WITH_ORGANIZER });
        })
        // The webhook may have been removed while the pool source was being checked.
        .catch(rethrowMissingWebhook)
    );
  }

  /**
   * Adds the user to the draft's players; a no-op if they're already in.
   * Throws DraftFullError if they aren't and the draft has as many players
   * as it can, and DraftStartedError once it has left Lobby.
   */
  async join(draftId: string, userId: string): Promise<void> {
    await this.lock.inLobbyShowing(draftId, userId, async ({ tx }) => {
      if (await tx.player.findFirst({ where: { draftId, userId } })) return;
      if ((await tx.player.count({ where: { draftId } })) >= MAX_PLAYERS) {
        throw new DraftFullError();
      }
      await tx.player.create({ data: { draftId, userId } });
    });
  }

  /**
   * Removes the user from the draft's players; a no-op if they're not in.
   * Returns whether they were. Throws DraftStartedError once the draft has
   * left Lobby.
   */
  async leave(draftId: string, userId: string): Promise<boolean> {
    return this.lock.inLobby(draftId, async ({ tx }) => {
      const { count } = await tx.player.deleteMany({
        where: { draftId, userId },
      });
      return count > 0;
    });
  }

  /**
   * Adds a new bot to the draft's players, numbered one past the
   * highest-numbered bot it has. Throws DraftFullError if the draft has as
   * many players as it can, and DraftStartedError once it has left Lobby.
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
   * Answers with the ids of the players it had, but the bots. Throws
   * DraftStartedError once the draft has left Lobby.
   */
  async cancel(draftId: string): Promise<string[]> {
    return this.lock.inLobby(draftId, async ({ tx }) => {
      const players = await tx.player.findMany({
        where: { draftId },
        select: { userId: true, user: { select: { isBot: true } } },
      });
      const bots = players.filter((player) => player.user.isBot);
      await tx.draft.delete({ where: { id: draftId } });
      // A bot only ever plays in the draft it was added to.
      await tx.user.deleteMany({
        where: { id: { in: bots.map((bot) => bot.userId) } },
      });
      return players
        .filter((player) => !player.user.isBot)
        .map((player) => player.userId);
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
    deadline: Deadline,
  ): Promise<CheckedCube> {
    const cubeId = cubeIdFrom(cubeLink);
    if (!cubeId) {
      throw new CubeLinkError({
        error: 'not-a-cube-link',
        message: 'That isn’t a CubeCobra cube link.',
      });
    }
    const found = await deadline.race(this.cubeCobra.cube(cubeId), () =>
      cubeCobraTooSlow(deadline),
    );
    if (!found) {
      // CubeCobra answers the same for a private cube as for a missing one.
      throw new CubeLinkError({
        error: 'cube-not-found',
        message: 'No public cube on CubeCobra has that id.',
      });
    }
    // The basic lands are left out: a player adds them to their plan one
    // copy at a time. An unidentified card is never one, whatever its name:
    // a custom card could be named "Island".
    const identified: CubeCard[] = [];
    const unidentified = new Set<string>();
    for (const card of found.mainboard) {
      if (card.oracleId === null) unidentified.add(card.name);
      else if (!isBasicLand(card.name)) identified.push(card);
    }
    if (identified.length === 0 && unidentified.size === 0) {
      throw new CubeLinkError({
        error: 'no-cards',
        message:
          found.mainboard.length === 0
            ? 'This cube has no mainboard cards.'
            : 'This cube has no mainboard cards besides basic lands.',
      });
    }
    if (unidentified.size > 0) {
      throw new CubeLinkError({
        error: 'unidentified-cards',
        message: unidentifiedCardsMessage(unidentified.size),
        cards: [...unidentified],
        totalCards: unidentified.size,
      });
    }
    // Searches still to come once the deadline passes would only hold up
    // other Scryfall requests, for a draft that won't be saved.
    const searches = new AbortController();
    const { printings, missing } = await deadline
      .race(
        cubePrintings(this.scryfall, identified, platform, searches.signal),
        () => scryfallTooSlow(deadline),
      )
      .finally(() => searches.abort());
    if (missing.length > 0) {
      throw new CubeLinkError({
        error: 'not-on-platform',
        message: notOnPlatformMessage(missing.length, 'in this cube', platform),
        cards: missing,
        totalCards: missing.length,
      });
    }
    return { cubeId, cubeName: found.name, printings };
  }

  private async checkPoolQuery(
    poolQuery: string,
    platform: Platform,
    deadline: Deadline,
  ): Promise<void> {
    // Like the snapshot, leave the basic lands out: a query that matches only
    // them would make an empty pool.
    const matches = await this.search(withoutBasicLands(poolQuery), deadline);
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
      deadline,
    );
    if (notOnPlatform) {
      const { totalCards } = notOnPlatform;
      throw new PoolQueryError({
        error: 'not-on-platform',
        message: notOnPlatformMessage(
          totalCards,
          'in this pool query',
          platform,
        ),
        cards: notOnPlatform.cards.map((card) => card.name),
        totalCards,
      });
    }
  }

  private async search(
    query: string,
    deadline: Deadline,
  ): Promise<ScryfallSearchPage | null> {
    try {
      return await deadline.race(this.scryfall.search(query), () =>
        scryfallTooSlow(deadline),
      );
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

/** Scryfall hadn't answered a check when the deadline passed. */
function scryfallTooSlow(deadline: Deadline): ScryfallUnavailableError {
  return ScryfallUnavailableError.tooSlow(
    deadline.name,
    new DeadlinePassedError(deadline.name),
  );
}

/** CubeCobra hadn't answered a check when the deadline passed. */
function cubeCobraTooSlow(deadline: Deadline): CubeCobraUnavailableError {
  return new CubeCobraUnavailableError(
    `CubeCobra didn’t answer within the ${deadline.name} deadline.`,
    { cause: new DeadlinePassedError(deadline.name) },
  );
}
