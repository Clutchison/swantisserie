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
import type { PoolSourceWithCubeId } from '../drafts/pool-source.js';
import { readPreferredPrintings } from '../drafts/preferred-printings.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SetCatalog } from '../sets/set-catalog.js';
import {
  newestFirst,
  readCompleteTournaments,
  type CompleteTournament,
} from '../tournaments/complete-tournaments.js';
import { decodeDecklist } from '../tournaments/decklist-json.js';

/** A complete tournament as the Trophy Hall reads it, with its trophy holders' kept decklists. */
type TournamentWithDecklists = TrophyHallTournament & {
  complete: CompleteTournament;
  /** Each trophy holder's decklist kept at Start, by their id: none for a holder whose decklist wasn't kept. */
  decklists: Map<string, PlanBoards>;
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
   * for testing. Nor does one with a trophy holder whose decklist wasn't
   * kept at Start (ADR 0017), as the engine's `onTrophyHall` decides.
   */
  async read(): Promise<TrophyHallView> {
    const complete = newestFirst(
      (await readCompleteTournaments(this.prisma)).filter(
        ({ botsPlayed }) => !botsPlayed,
      ),
    );
    const kept = await this.keptDecklists(complete);
    const hall = trophyHall(
      complete.map((tournament): TournamentWithDecklists => {
        const decklists = kept.get(tournament.draftId) ?? new Map();
        return {
          poolSource: groupedPoolSource(tournament.draft.poolSourceWithCubeId),
          trophyHolders: tournament.view.trophyHolders,
          decklistsKept: [...decklists.keys()],
          complete: tournament,
          decklists,
        };
      }),
    );
    // A tournament on the Trophy Hall has every trophy holder's decklist.
    const groups = hall.groups.map(({ latest, rows }) => ({
      latest,
      rows: rows.map((row) => {
        const boards = row.tournament.decklists.get(row.playerId)!;
        return {
          ...row,
          boards,
          planned: [...boards.mainboard, ...boards.sideboard],
        };
      }),
    }));

    const rows = groups.flatMap((group) => group.rows);
    const playerIds = [...new Set(rows.map((row) => row.playerId))];
    const names = await this.currentNames(playerIds);
    const printings = await readPreferredPrintings(this.prisma, playerIds);
    const poolCards = await this.poolCards(rows.flatMap((row) => row.planned));
    const setNames = groups.some(
      ({ latest }) => latest.complete.draft.poolSource.kind === 'set-list',
    )
      ? await this.setNames()
      : new Map<string, string>();

    return {
      groups: groups.map(({ latest, rows }) => ({
        poolSource: headerOf(
          latest.complete.draft.poolSourceWithCubeId,
          setNames,
        ),
        rows: rows.map(
          ({ tournament, playerId, trophies, boards, planned }) => ({
            playerId,
            name: names.get(playerId)!,
            trophies,
            draftId: tournament.complete.draftId,
            draftName: tournament.complete.draft.name,
            completedAt: tournament.complete.view.completedAt,
            decklist: {
              playerId,
              ...boards,
              preferredPrintings: printings.get(playerId)!,
            },
            // Each pool card is one copy, so a decklist holds it at most once.
            cards: planned.flatMap(
              ({ poolCardId }) => poolCards.get(poolCardId) ?? [],
            ),
          }),
        ),
      })),
    };
  }

  /**
   * Each trophy holder's decklist kept at Start, by their id, by their
   * tournament's draft id. A holder whose decklist wasn't kept has none.
   */
  private async keptDecklists(
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
    const decklists = new Map<string, Map<string, PlanBoards>>();
    for (const { decklist, tournament, player } of entries) {
      if (decklist === null) continue;
      if (!holders.get(tournament.draftId)!.has(player.userId)) continue;
      let byPlayer = decklists.get(tournament.draftId);
      if (!byPlayer) {
        byPlayer = new Map();
        decklists.set(tournament.draftId, byPlayer);
      }
      byPlayer.set(player.userId, decodeDecklist(decklist));
    }
    return decklists;
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

/** The pool source as the Trophy Hall groups it. */
function groupedPoolSource(source: PoolSourceWithCubeId): GroupedPoolSource {
  return source.kind === 'cube'
    ? { kind: 'cube', cubeId: source.cube.id }
    : source;
}

/** The pool source as a group is headed by it, its sets named. */
function headerOf(
  source: PoolSourceWithCubeId,
  setNames: Map<string, string>,
): TrophyHallPoolSourceView {
  if (source.kind !== 'set-list') return source;
  const named = (code: string): NamedSetView => ({
    code,
    name: setNames.get(code) ?? code.toUpperCase(),
  });
  return {
    kind: 'set-list',
    setList: source.setList.map(({ code, sublists }) => ({
      ...named(code),
      sublists: sublists.map(named),
    })),
  };
}
