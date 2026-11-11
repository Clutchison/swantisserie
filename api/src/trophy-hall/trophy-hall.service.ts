import { Injectable, Logger } from '@nestjs/common';
import type {
  NamedSetView,
  PlanBoards,
  TrophyHallPoolSourceView,
  TrophyHallView,
} from 'contract';
import {
  trophyHall,
  type GroupedPoolSource,
  type TrophyHallTournament,
} from 'engine';
import { toPoolCardView } from '../drafts/draft-view.js';
import { readPreferredPrintings } from '../drafts/preferred-printings.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SetCatalog } from '../sets/set-catalog.js';
import {
  newestFirst,
  readCompleteTournaments,
  type CompleteTournament,
} from '../tournaments/complete-tournaments.js';
import { decodeDecklist } from '../tournaments/decklist-json.js';

/** A complete tournament as the Trophy Hall reads it, with its holders' kept decks. */
type HallRead = TrophyHallTournament & {
  complete: CompleteTournament;
  /** Each trophy holder's deck as it was locked at Start, by their id. */
  decks: Map<string, PlanBoards>;
};

/** The Trophy Hall. Until drafts belong to guilds (#208), it covers every draft's tournament. */
@Injectable()
export class TrophyHallService {
  private readonly logger = new Logger(TrophyHallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sets: SetCatalog,
  ) {}

  /**
   * The Trophy Hall of every complete tournament, worked out on each read
   * from their standings. Cancelled tournaments are gone, so count
   * nowhere, and neither does a tournament any bot played in, as bots exist
   * for testing. A trophy holder whose deck wasn't kept at Start (ADR 0017)
   * has no row, and their trophy counts nowhere.
   */
  async read(): Promise<TrophyHallView> {
    const complete = newestFirst(
      (await readCompleteTournaments(this.prisma)).filter(
        ({ botsPlayed }) => !botsPlayed,
      ),
    );
    const decks = await this.keptDecks(complete);
    const { groups } = trophyHall(
      complete.map((tournament): HallRead => {
        const kept = decks.get(tournament.draftId) ?? new Map();
        return {
          poolSource: groupedPoolSource(tournament),
          trophyHolders: tournament.view.trophyHolders.filter((id) =>
            kept.has(id),
          ),
          complete: tournament,
          decks: kept,
        };
      }),
    );

    const rows = groups.flatMap((group) => group.rows);
    const playerIds = [...new Set(rows.map((row) => row.playerId))];
    const names = await this.currentNames(playerIds);
    const printings = await readPreferredPrintings(this.prisma, playerIds);
    const cards = await this.poolCards(
      rows.flatMap(({ tournament, playerId }) => {
        const deck = tournament.decks.get(playerId)!;
        return [...deck.mainboard, ...deck.sideboard];
      }),
    );
    const setNames = groups.some(
      (group) => group.latest.complete.draft.poolSource.kind === 'set-list',
    )
      ? await this.setNames()
      : new Map<string, string>();

    return {
      groups: groups.map((group) => ({
        poolSource: headerOf(group.latest.complete, setNames),
        rows: group.rows.map(({ tournament, playerId, trophies }) => {
          const deck = tournament.decks.get(playerId)!;
          return {
            playerId,
            name: names.get(playerId)!,
            trophies,
            draftId: tournament.complete.draftId,
            completedAt: tournament.complete.view.completedAt,
            decklist: {
              playerId,
              ...deck,
              preferredPrintings: printings.get(playerId)!,
            },
            // Each pool card is one copy, so a deck holds it at most once.
            cards: [...deck.mainboard, ...deck.sideboard].flatMap(
              ({ poolCardId }) => cards.get(poolCardId) ?? [],
            ),
          };
        }),
      })),
    };
  }

  /**
   * Each trophy holder's deck as it was locked at Start, by their id, by
   * their tournament's draft id. A holder whose deck wasn't kept has none.
   */
  private async keptDecks(
    complete: CompleteTournament[],
  ): Promise<Map<string, Map<string, PlanBoards>>> {
    const holders = new Map(
      complete.map((t) => [t.draftId, new Set(t.view.trophyHolders)]),
    );
    const entries = await this.prisma.tournamentEntry.findMany({
      where: {
        tournament: { draftId: { in: [...holders.keys()] } },
        player: {
          userId: {
            in: [...new Set(complete.flatMap((t) => t.view.trophyHolders))],
          },
        },
      },
      select: {
        decklist: true,
        tournament: { select: { draftId: true } },
        player: { select: { userId: true } },
      },
    });
    const decks = new Map<string, Map<string, PlanBoards>>();
    for (const { decklist, tournament, player } of entries) {
      if (decklist === null) continue;
      if (!holders.get(tournament.draftId)!.has(player.userId)) continue;
      let byPlayer = decks.get(tournament.draftId);
      if (!byPlayer) {
        byPlayer = new Map();
        decks.set(tournament.draftId, byPlayer);
      }
      byPlayer.set(player.userId, decodeDecklist(decklist));
    }
    return decks;
  }

  /** Each player's current name, by their id. */
  private async currentNames(
    playerIds: string[],
  ): Promise<Map<string, string>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
  }

  /** The pool cards `planned` are, by id. */
  private async poolCards(planned: { poolCardId: string }[]) {
    const found = await this.prisma.poolCard.findMany({
      where: { id: { in: [...new Set(planned.map((c) => c.poolCardId))] } },
    });
    return new Map(found.map((card) => [card.id, toPoolCardView(card)]));
  }

  /**
   * Every Scryfall set's name, by its code; none when Scryfall can't list
   * them, so a set list is headed by its codes rather than the Trophy Hall
   * failing.
   */
  private async setNames(): Promise<Map<string, string>> {
    try {
      const sets = await this.sets.scryfallSets();
      return new Map(sets.map((set) => [set.code, set.name]));
    } catch (error) {
      this.logger.warn(
        `Naming the Trophy Hall's sets failed: ${String(error)}`,
      );
      return new Map();
    }
  }
}

/** The tournament's draft's pool source as the Trophy Hall groups it. */
function groupedPoolSource({ draft }: CompleteTournament): GroupedPoolSource {
  const { poolSource } = draft;
  return poolSource.kind === 'cube'
    ? { kind: 'cube', cubeId: draft.cubeId! }
    : poolSource;
}

/** The pool source a group is headed by: its latest draft's, its sets named. */
function headerOf(
  { draft }: CompleteTournament,
  setNames: Map<string, string>,
): TrophyHallPoolSourceView {
  const { poolSource } = draft;
  switch (poolSource.kind) {
    case 'cube':
      return { kind: 'cube', cube: { id: draft.cubeId!, ...poolSource.cube } };
    case 'pool-query':
      return poolSource;
    case 'set-list': {
      const named = (code: string): NamedSetView => ({
        code,
        name: setNames.get(code) ?? code.toUpperCase(),
      });
      return {
        kind: 'set-list',
        setList: poolSource.setList.map(({ code, sublists }) => ({
          ...named(code),
          sublists: sublists.map(named),
        })),
      };
    }
  }
}
