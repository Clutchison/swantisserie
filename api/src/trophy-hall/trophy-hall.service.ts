import { Injectable } from '@nestjs/common';
import type { PlanBoards, TrophyHallView } from 'contract';
import {
  trophyHall,
  type GroupedPoolSource,
  type TrophyHallTournament,
} from 'engine';
import { toPoolCardView } from '../drafts/draft-view.js';
import {
  toNamedPoolSource,
  type PoolSourceWithCubeId,
} from '../drafts/pool-source.js';
import { readPreferredPrintings } from '../drafts/preferred-printings.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SetCatalog } from '../sets/set-catalog.js';
import { setNamesFor } from '../sets/set-names.js';
import {
  readTournamentsThatCount,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly sets: SetCatalog,
  ) {}

  /**
   * The Trophy Hall of the complete tournaments that count, worked out on
   * each read from their standings. A tournament with no trophy holder
   * doesn't appear, nor does one with a trophy holder whose decklist wasn't
   * kept at Start (ADR 0017), as the engine's `onTrophyHall` decides.
   */
  async read(): Promise<TrophyHallView> {
    const complete = await readTournamentsThatCount(this.prisma);
    const kept = await this.keptDecklists(complete);
    const hall = trophyHall(
      complete.map((tournament): TournamentWithDecklists => {
        const decklists = kept.get(tournament.draftId) ?? new Map();
        return {
          poolSource: groupedPoolSource(tournament.draft.poolSource),
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
    const setNames = await setNamesFor(
      this.sets,
      groups.map(({ latest }) => latest.complete.draft.poolSource),
    );

    return {
      // Every ranked player holds a trophy, so has a row, and a name here.
      ranking: hall.ranking.map(({ playerId, trophies, place }) => ({
        playerId,
        name: names.get(playerId)!,
        trophies,
        place,
      })),
      groups: groups.map(({ latest, rows }) => ({
        poolSource: toNamedPoolSource(
          latest.complete.draft.poolSource,
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
}

/** The pool source as the Trophy Hall groups it. */
function groupedPoolSource(source: PoolSourceWithCubeId): GroupedPoolSource {
  return source.kind === 'cube'
    ? { kind: 'cube', cubeId: source.cube.id }
    : source;
}
