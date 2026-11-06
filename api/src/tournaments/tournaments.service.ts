import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  MIN_MAINBOARD_CARDS,
  type GameScore,
  type GrantedDrawRequest,
  type TournamentRefusal,
  type TournamentSetupRequest,
  type TournamentView,
} from 'contract';
import {
  MIN_UNDROPPED_PLAYERS,
  pairSwissRound,
  reportProblem,
  roundRobinSchedule,
  type ScheduledRound,
} from 'engine';
import type {
  SwissRoundOption,
  TournamentFormat,
  TournamentState,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DraftGoneError, NotAPlayerError } from '../drafts/draft-errors.js';
import { DraftLock } from '../drafts/draft-lock.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import {
  InvalidTournamentRequestError,
  NoMatchError,
  NoTournamentError,
  TournamentRefusedError,
} from './tournament-errors.js';
import {
  byesOf,
  roundCount,
  TOURNAMENT_VIEW,
  toTournamentView,
} from './tournament-view.js';

/** What a change reads of the tournament it changes. */
interface LockedTournament {
  id: string;
  format: TournamentFormat;
  swissRoundOption: SwissRoundOption | null;
  state: TournamentState;
  lastCompletedRound: number;
}

/**
 * A complete draft's tournament: its setup, registration and cancelling.
 * Every change runs under the draft's lock, which bumps the draft's version,
 * so the controller's publish tells open pages to re-read it. Joining under
 * that lock also waits for any plan write in flight, which share-locks the
 * draft, so a deck can't change as it is checked and locked.
 */
@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: DraftLock,
  ) {}

  /** The draft's tournament. Throws NoTournamentError if it has none. */
  async read(draftId: string): Promise<TournamentView> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { draftId },
      select: TOURNAMENT_VIEW,
    });
    if (!tournament) throw new NoTournamentError();
    return toTournamentView(tournament);
  }

  /**
   * Sets up the draft's tournament as `setup` chooses, in registration.
   * Throws TournamentRefusedError unless the draft is complete and has none
   * yet.
   */
  async setUp(draftId: string, setup: TournamentSetupRequest): Promise<void> {
    await this.lock.whileIn(
      draftId,
      ['Complete'],
      () =>
        new TournamentRefusedError({
          error: 'draft-not-complete',
          message: 'Only a complete draft can have a tournament.',
        }),
      async ({ tx }) => {
        const existing = await tx.tournament.findUnique({
          where: { draftId },
          select: { id: true },
        });
        if (existing) {
          throw new TournamentRefusedError({
            error: 'tournament-exists',
            message: 'This draft already has a tournament.',
          });
        }
        await tx.tournament.create({
          data: {
            draftId,
            format: setup.format,
            swissRoundOption:
              setup.format === 'Swiss' ? setup.swissRoundOption : null,
          },
        });
      },
    );
  }

  /**
   * Joins the user to the draft's tournament, which locks their deck.
   * Throws NotAPlayerError if they aren't one of the draft's players, and
   * TournamentRefusedError if they are a bot, have joined already, or their
   * mainboard holds fewer than MIN_MAINBOARD_CARDS, or the tournament is
   * past registration.
   */
  async join(draftId: string, userId: string): Promise<void> {
    await this.inRegistration(draftId, async (tx, tournament) => {
      const player = await tx.player.findUnique({
        where: { draftId_userId: { draftId, userId } },
        select: {
          id: true,
          user: { select: { isBot: true } },
          tournamentEntry: { select: { id: true } },
        },
      });
      if (!player) throw new NotAPlayerError('tournaments');
      if (player.user.isBot) {
        throw new TournamentRefusedError({
          error: 'bots-cannot-join',
          message: 'Bots never play in tournaments.',
        });
      }
      if (player.tournamentEntry) {
        throw new TournamentRefusedError({
          error: 'already-joined',
          message: 'You have already joined this tournament.',
        });
      }
      const cards = await mainboardSize(tx, player.id);
      if (cards < MIN_MAINBOARD_CARDS) {
        throw new TournamentRefusedError({
          error: 'deck-too-small',
          message: `Your mainboard holds ${cards} ${cards === 1 ? 'card' : 'cards'}. A tournament deck needs at least ${MIN_MAINBOARD_CARDS}.`,
        });
      }
      await tx.tournamentEntry.create({
        data: { tournamentId: tournament.id, playerId: player.id },
      });
    });
  }

  /**
   * Takes the draft's player `userId` out of its tournament, unlocking
   * their deck: they leave, or an organizer removes them. Throws
   * TournamentRefusedError if they haven't joined, or the tournament is past
   * registration.
   */
  async removeEntry(draftId: string, userId: string): Promise<void> {
    await this.inRegistration(draftId, async (tx, tournament) => {
      const { count } = await tx.tournamentEntry.deleteMany({
        where: { tournamentId: tournament.id, player: { draftId, userId } },
      });
      if (count === 0) {
        throw new TournamentRefusedError({
          error: 'not-joined',
          message: 'That player hasn’t joined this tournament.',
        });
      }
    });
  }

  /**
   * Cancels the draft's tournament during registration or play, deleting it
   * with its entries and matches, so nothing from it counts and every deck
   * unlocks. Throws TournamentRefusedError once it is complete.
   */
  async cancel(draftId: string): Promise<void> {
    await this.withTournament(draftId, async (tx, tournament) => {
      if (tournament.state === 'Complete') {
        throw new TournamentRefusedError({
          error: 'tournament-complete',
          message:
            'A complete tournament can’t be cancelled. An organizer can still correct its matches.',
        });
      }
      await tx.tournament.delete({ where: { id: tournament.id } });
    });
  }

  /**
   * Confirms the match `matchId`'s game score as the draft's user `userId`:
   * a player of it who didn't report it. Throws NoMatchError if the
   * tournament has no such match, and TournamentRefusedError if the user
   * isn't one of its players, reported it, or it has no reported game
   * score. A match can be confirmed while the tournament is playing or once
   * it is complete.
   */
  async confirm(
    draftId: string,
    matchId: string,
    userId: string,
  ): Promise<void> {
    await this.withTournament(draftId, async (tx, tournament) => {
      const match = await findMatch(tx, tournament.id, matchId);
      if (!match.players.includes(userId)) {
        throw new TournamentRefusedError({
          error: 'not-your-match',
          message: 'Only a match’s own players can confirm it.',
        });
      }
      if (match.outcome !== 'GameScore') {
        throw new TournamentRefusedError({
          error: 'not-reported',
          message: 'Only a reported game score can be confirmed.',
        });
      }
      if (match.reportedById === userId) {
        throw new TournamentRefusedError({
          error: 'own-report',
          message: 'You reported this match. Your opponent confirms it.',
        });
      }
      await tx.match.update({
        where: { id: matchId },
        data: { confirmed: true },
      });
    });
  }

  /**
   * Sets the match `matchId`'s game score, `games` in its player order, as
   * an organizer, the draft's user `userId`, does: reporting it for its
   * players or correcting it, while the tournament is playing or once it is
   * complete. The opponent hasn't agreed to it, so it is unconfirmed. Throws
   * NoMatchError if the tournament has no such match, and
   * TournamentRefusedError if the game score isn't 2–0 or 2–1 for either
   * side.
   */
  async setGameScore(
    draftId: string,
    matchId: string,
    userId: string,
    games: GameScore,
  ): Promise<void> {
    await this.withTournament(draftId, async (tx, tournament) => {
      await findMatch(tx, tournament.id, matchId);
      const problem = reportProblem(games);
      if (problem) throw new TournamentRefusedError(problem);
      await tx.match.update({
        where: { id: matchId },
        data: {
          outcome: 'GameScore',
          firstGames: games[0],
          secondGames: games[1],
          drawnGames: 0,
          forfeitedBy: null,
          reportedById: userId,
          confirmed: false,
        },
      });
    });
  }

  /**
   * Clears the match `matchId`'s game score, as an organizer does. While the
   * tournament is playing, a match one of whose players has dropped is their
   * forfeit again, as reinstating a player leaves a match against a player
   * still dropped. Otherwise it is unreported again while its tournament
   * round is open, and a granted draw once its round or the tournament is
   * complete, as completing it would have made it, so a completed round
   * stays completed. Throws NoMatchError if the tournament has no such
   * match.
   */
  async clearGameScore(draftId: string, matchId: string): Promise<void> {
    await this.withTournament(draftId, async (tx, tournament) => {
      const { round, dropped } = await findMatch(tx, tournament.id, matchId);
      const forfeitedBy =
        tournament.state !== 'Playing'
          ? null
          : dropped[0]
            ? ('First' as const)
            : dropped[1]
              ? ('Second' as const)
              : null;
      const roundCompleted =
        tournament.state === 'Complete' ||
        round <= tournament.lastCompletedRound;
      await tx.match.update({
        where: { id: matchId },
        data: {
          outcome: forfeitedBy
            ? 'Forfeit'
            : roundCompleted
              ? 'GrantedDraw'
              : 'Unreported',
          firstGames: 0,
          secondGames: 0,
          drawnGames: 0,
          forfeitedBy,
          reportedById: null,
          confirmed: false,
        },
      });
    });
  }

  /**
   * Starts the draft's tournament, closing joining. Round robin makes every
   * match of the round robin schedule of its entries, in join order, byes
   * included, all open at once; Swiss pairs round 1 at random. Throws
   * TournamentRefusedError if fewer than 2 players have joined, or it is
   * past registration.
   */
  async start(draftId: string): Promise<void> {
    await this.inRegistration(draftId, async (tx, tournament) => {
      const entries = await tx.tournamentEntry.findMany({
        where: { tournamentId: tournament.id },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      if (entries.length < 2) {
        throw new TournamentRefusedError({
          error: 'too-few-players-joined',
          message: 'A tournament needs at least 2 players to start.',
        });
      }
      await tx.tournament.update({
        where: { id: tournament.id },
        data: { state: 'Playing', startedAt: new Date() },
      });
      if (tournament.format === 'Swiss') {
        await pairSwiss(tx, tournament.id, 1);
        return;
      }
      const schedule = roundRobinSchedule(entries.map((entry) => entry.id));
      await createRounds(
        tx,
        tournament.id,
        schedule.map((scheduled, i) => ({ round: i + 1, ...scheduled })),
      );
    });
  }

  /**
   * Reports the match `matchId`'s game score, `games` in its player order,
   * as the draft's user `userId`, one of its players. Throws NoMatchError
   * if the tournament has no such match, and TournamentRefusedError if the
   * user isn't one of its players, it is reported already, the game score
   * isn't 2–0 or 2–1 for either side, or the tournament isn't playing.
   */
  async report(
    draftId: string,
    matchId: string,
    userId: string,
    games: GameScore,
  ): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
      const match = await tx.match.findFirst({
        where: {
          id: matchId,
          tournamentId: tournament.id,
          secondEntryId: { not: null },
        },
        select: {
          outcome: true,
          firstEntry: { select: { player: { select: { userId: true } } } },
          secondEntry: { select: { player: { select: { userId: true } } } },
        },
      });
      if (!match) throw new NoMatchError();
      const players = [match.firstEntry, match.secondEntry].map(
        (entry) => entry?.player.userId,
      );
      if (!players.includes(userId)) {
        throw new TournamentRefusedError({
          error: 'not-your-match',
          message: 'Only a match’s own players can report it.',
        });
      }
      if (match.outcome !== 'Unreported') {
        throw new TournamentRefusedError({
          error: 'match-reported',
          message:
            'This match has been reported. Only an organizer can change it.',
        });
      }
      const problem = reportProblem(games);
      if (problem) throw new TournamentRefusedError(problem);
      await tx.match.update({
        where: { id: matchId },
        data: {
          outcome: 'GameScore',
          firstGames: games[0],
          secondGames: games[1],
          drawnGames: 0,
          reportedById: userId,
        },
      });
    });
  }

  /**
   * Completes the draft's round robin tournament: every unreported match
   * becomes a granted draw, and every deck unlocks. Throws
   * TournamentRefusedError if it isn't playing, or is Swiss, which completes
   * with its final tournament round.
   */
  async complete(draftId: string): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
      if (tournament.format !== 'RoundRobin') {
        throw new TournamentRefusedError({
          error: 'wrong-format',
          message:
            'A Swiss tournament completes when its final tournament round is completed.',
        });
      }
      await tx.match.updateMany({
        where: {
          tournamentId: tournament.id,
          outcome: 'Unreported',
          secondEntryId: { not: null },
        },
        data: { outcome: 'GrantedDraw' },
      });
      await tx.tournament.update({
        where: { id: tournament.id },
        data: { state: 'Complete' },
      });
    });
  }

  /**
   * Completes the current tournament round of the draft's tournament, in a
   * format that plays one tournament round at a time. Its format's round
   * steps first settle the round as `grantedDraws` asks; the round must
   * then have no unreported match. It then completes the tournament, which
   * unlocks every deck, after the final tournament round or once fewer than
   * MIN_UNDROPPED_PLAYERS undropped players remain, and otherwise has the
   * format pair the next tournament round. A completed round stays
   * completed. Throws as the format's round steps do, and
   * TournamentRefusedError if the tournament isn't playing, the round has
   * an unreported match, or it is round robin, which plays every round at
   * once.
   */
  async completeRound(
    draftId: string,
    grantedDraws: readonly GrantedDrawRequest[],
  ): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
      const steps = ROUND_STEPS[tournament.format];
      if (!steps) {
        throw new TournamentRefusedError({
          error: 'wrong-format',
          message:
            'A round robin tournament plays all its tournament rounds at once. Complete the tournament instead.',
        });
      }
      const round = tournament.lastCompletedRound + 1;
      const joined = await tx.tournamentEntry.count({
        where: { tournamentId: tournament.id },
      });
      const finalRound = round >= roundCount(tournament, joined);
      await steps.settle(tx, {
        tournamentId: tournament.id,
        round,
        finalRound,
        grantedDraws,
      });
      await refuseUnreported(tx, tournament.id, round);
      const undropped = await tx.tournamentEntry.count({
        where: { tournamentId: tournament.id, dropped: false },
      });
      const completes = finalRound || undropped < MIN_UNDROPPED_PLAYERS;
      await tx.tournament.update({
        where: { id: tournament.id },
        data: {
          lastCompletedRound: round,
          ...(completes && { state: 'Complete' }),
        },
      });
      if (!completes) await steps.pairNext(tx, tournament.id, round + 1);
    });
  }

  /**
   * Drops the draft's player `userId` from its tournament: every unplayed
   * match of theirs becomes a forfeit by them, and their played matches
   * stand. Their deck stays locked. Throws TournamentRefusedError if they
   * haven't joined or have dropped already, or the tournament isn't playing.
   */
  async drop(draftId: string, userId: string): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
      const entry = await entryOf(tx, tournament, draftId, userId);
      if (entry.dropped) {
        throw new TournamentRefusedError({
          error: 'already-dropped',
          message: 'That player has already dropped.',
        });
      }
      await tx.tournamentEntry.update({
        where: { id: entry.id },
        data: { dropped: true },
      });
      await forfeitUnplayed(tx, entry.id);
    });
  }

  /**
   * Reinstates the draft's dropped player `userId`: their forfeits
   * become unreported matches again, except against an opponent who has
   * dropped too, whose forfeit they become. Throws TournamentRefusedError if
   * they haven't joined or haven't dropped, or the tournament isn't playing.
   */
  async reinstate(draftId: string, userId: string): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
      const entry = await entryOf(tx, tournament, draftId, userId);
      if (!entry.dropped) {
        throw new TournamentRefusedError({
          error: 'not-dropped',
          message: 'That player hasn’t dropped.',
        });
      }
      const pairedWithout = await currentRoundWithout(
        tx,
        tournament.id,
        entry.id,
      );
      if (pairedWithout) {
        throw new TournamentRefusedError({
          error: 'paired-since-drop',
          message: `That player can’t be reinstated: tournament round ${pairedWithout} was paired after they dropped.`,
        });
      }
      await tx.tournamentEntry.update({
        where: { id: entry.id },
        data: { dropped: false },
      });
      await tx.match.updateMany({
        where: {
          outcome: 'Forfeit',
          OR: [
            { firstEntryId: entry.id, forfeitedBy: 'First' },
            { secondEntryId: entry.id, forfeitedBy: 'Second' },
          ],
        },
        data: {
          outcome: 'Unreported',
          forfeitedBy: null,
          reportedById: null,
          confirmed: false,
        },
      });
      const stillDropped = await tx.tournamentEntry.findMany({
        where: { tournamentId: tournament.id, dropped: true },
        select: { id: true },
      });
      for (const other of stillDropped) await forfeitUnplayed(tx, other.id);
    });
  }

  /**
   * Runs `change` with the draft's row locked, if its tournament is in
   * registration. Throws NoTournamentError if it has none, and
   * TournamentRefusedError if it is past registration.
   */
  private inRegistration(
    draftId: string,
    change: (tx: Transaction, tournament: LockedTournament) => Promise<void>,
  ): Promise<void> {
    return this.whileIn(draftId, 'Registration', change, {
      error: 'not-in-registration',
      message: 'This tournament has started.',
    });
  }

  /**
   * Runs `change` with the draft's row locked, if its tournament is
   * playing. Throws NoTournamentError if it has none, and
   * TournamentRefusedError if it isn't playing.
   */
  private inPlay(
    draftId: string,
    change: (tx: Transaction, tournament: LockedTournament) => Promise<void>,
  ): Promise<void> {
    return this.whileIn(draftId, 'Playing', change, {
      error: 'not-playing',
      message: 'This tournament isn’t being played.',
    });
  }

  /**
   * Runs `change` with the draft's row locked, if its tournament is in
   * `state`. Throws NoTournamentError if it has none, and
   * TournamentRefusedError with `refusal` if it is in another state.
   */
  private whileIn(
    draftId: string,
    state: TournamentState,
    change: (tx: Transaction, tournament: LockedTournament) => Promise<void>,
    refusal: TournamentRefusal,
  ): Promise<void> {
    return this.withTournament(draftId, async (tx, tournament) => {
      if (tournament.state !== state) {
        throw new TournamentRefusedError(refusal);
      }
      await change(tx, tournament);
    });
  }

  /**
   * Runs `change` with the draft's row locked, whatever state its
   * tournament is in. Throws NoTournamentError if it has none.
   */
  private async withTournament(
    draftId: string,
    change: (tx: Transaction, tournament: LockedTournament) => Promise<void>,
  ): Promise<void> {
    await this.lock.run(draftId, async (draft) => {
      if (!draft) throw new DraftGoneError();
      const tournament = await draft.tx.tournament.findUnique({
        where: { draftId },
        select: {
          id: true,
          format: true,
          swissRoundOption: true,
          state: true,
          lastCompletedRound: true,
        },
      });
      if (!tournament) throw new NoTournamentError();
      await change(draft.tx, tournament);
    });
  }
}

/** The tournament round Complete round is completing, and what it was asked. */
interface RoundToSettle {
  tournamentId: string;
  round: number;
  /** Whether it is the tournament's final tournament round. */
  finalRound: boolean;
  grantedDraws: readonly GrantedDrawRequest[];
}

/** What completing a tournament round does that depends on the format. */
interface RoundSteps {
  /** Settles the round's unreported matches, and any drops, before Complete round checks none is left. */
  settle(tx: Transaction, round: RoundToSettle): Promise<void>;
  /** Pairs tournament round `round`, the next. */
  pairNext(tx: Transaction, tournamentId: string, round: number): Promise<void>;
}

/**
 * The round steps of each format that plays one tournament round at a
 * time; round robin, which plays every round at once, has none. Swiss
 * grants draws with their drop choices, which apply except in the final
 * tournament round, and pairs the next round with the Swiss pairer.
 */
const ROUND_STEPS: Partial<Record<TournamentFormat, RoundSteps>> = {
  Swiss: {
    async settle(tx, { tournamentId, round, finalRound, grantedDraws }) {
      const dropping = await grantDraws(tx, tournamentId, round, grantedDraws);
      if (finalRound) return;
      await tx.tournamentEntry.updateMany({
        where: { id: { in: dropping } },
        data: { dropped: true },
      });
    },
    pairNext: pairSwiss,
  },
};

/**
 * Throws TournamentRefusedError if tournament round `round` of the
 * tournament `tournamentId` has an unreported match.
 */
async function refuseUnreported(
  tx: Transaction,
  tournamentId: string,
  round: number,
) {
  const unreported = await tx.match.count({
    where: {
      tournamentId,
      round,
      outcome: 'Unreported',
      secondEntryId: { not: null },
    },
  });
  if (unreported > 0) {
    throw new TournamentRefusedError({
      error: 'unreported-matches',
      message: `Tournament round ${round} has ${unreported} unreported ${unreported === 1 ? 'match' : 'matches'}. Report ${unreported === 1 ? 'it' : 'them'}, or grant ${unreported === 1 ? 'it a draw' : 'them draws'}, before completing the tournament round.`,
    });
  }
}

/**
 * Pairs tournament round `round` of the Swiss tournament `tournamentId`
 * with the Swiss pairer, from its standings, matches and byes so far, and
 * makes its matches and bye. Dropped players aren't paired. The order
 * within a score group, and so the bye, follows the full MTR ranking of the
 * standings; the seed is random, so round 1 pairs at random and it breaks
 * any ties left after every tiebreaker.
 */
async function pairSwiss(tx: Transaction, tournamentId: string, round: number) {
  const row = await tx.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: TOURNAMENT_VIEW,
  });
  // The view's standings name players by user id; matches are made between entries.
  const view = toTournamentView(row);
  const entryOfUser = new Map(
    row.entries.map((entry) => [entry.player.userId, entry.id]),
  );
  const entry = (userId: string) => entryOfUser.get(userId)!;
  const { matches, bye } = pairSwissRound({
    standings: view.standings,
    pastMatches: view.rounds.flatMap((past) =>
      past.matches.map((match) => match.players),
    ),
    pastByes: byesOf(view.rounds),
    dropped: view.entries
      .filter((entry) => entry.dropped)
      .map((entry) => entry.playerId),
    seed: randomInt(2 ** 31),
  });
  await createRounds(tx, tournamentId, [
    {
      round,
      matches: matches.map(([a, b]) => [entry(a), entry(b)]),
      bye: bye && entry(bye),
    },
  ]);
}

/**
 * Grants a draw in each unreported match of tournament round `round` that
 * `grantedDraws` lists, and answers the tournament entry ids of the
 * players listed to drop from them. An unreported match it leaves out
 * stays unreported, for Complete round to refuse. Throws
 * InvalidTournamentRequestError if it lists a match that isn't one of the
 * round's, or a player to drop who isn't in theirs, and
 * TournamentRefusedError if it lists a match reported since.
 */
async function grantDraws(
  tx: Transaction,
  tournamentId: string,
  round: number,
  grantedDraws: readonly GrantedDrawRequest[],
): Promise<string[]> {
  const matches = await tx.match.findMany({
    where: { tournamentId, round, secondEntryId: { not: null } },
    select: {
      id: true,
      outcome: true,
      firstEntry: { select: ENTRY_OF_MATCH },
      secondEntry: { select: ENTRY_OF_MATCH },
    },
  });
  const byId = new Map(matches.map((match) => [match.id, match]));
  const dropping: string[] = [];
  for (const { matchId, drop } of grantedDraws) {
    const match = byId.get(matchId);
    if (!match) {
      throw new InvalidTournamentRequestError(
        `Tournament round ${round} has no match ${matchId}.`,
      );
    }
    const entries = [match.firstEntry, match.secondEntry!];
    for (const playerId of drop) {
      const entry = entries.find((e) => e.player.userId === playerId);
      if (!entry) {
        throw new InvalidTournamentRequestError(
          'Only a match’s own players can be dropped with its granted draw.',
        );
      }
      dropping.push(entry.id);
    }
    if (match.outcome !== 'Unreported') {
      throw new TournamentRefusedError({
        error: 'match-reported',
        message: `A match listed for a granted draw has been ${match.outcome === 'Forfeit' ? 'forfeited' : 'reported'} since. Look at tournament round ${round} again before completing it.`,
      });
    }
  }
  await tx.match.updateMany({
    where: { id: { in: grantedDraws.map((draw) => draw.matchId) } },
    data: { outcome: 'GrantedDraw' },
  });
  return dropping;
}

/** Makes the matches and byes of `rounds`, whose players are tournament entry ids. */
async function createRounds(
  tx: Transaction,
  tournamentId: string,
  rounds: readonly ({ round: number } & ScheduledRound)[],
) {
  await tx.match.createMany({
    data: rounds.flatMap(({ round, matches, bye }) => [
      ...matches.map(([firstEntryId, secondEntryId]) => ({
        tournamentId,
        round,
        firstEntryId,
        secondEntryId,
      })),
      ...(bye ? [{ tournamentId, round, firstEntryId: bye }] : []),
    ]),
  });
}

/** What findMatch and grantDraws read of each of a match's entries. */
const ENTRY_OF_MATCH = {
  id: true,
  dropped: true,
  player: { select: { userId: true } },
} as const;

/**
 * The tournament's match `matchId`, with its tournament round, and its
 * players' Discord user ids and whether each has dropped, in its player
 * order.
 * Throws NoMatchError if it has no such match; a bye is no match.
 */
async function findMatch(
  tx: Transaction,
  tournamentId: string,
  matchId: string,
) {
  const match = await tx.match.findFirst({
    where: { id: matchId, tournamentId, secondEntryId: { not: null } },
    select: {
      round: true,
      outcome: true,
      reportedById: true,
      firstEntry: { select: ENTRY_OF_MATCH },
      secondEntry: { select: ENTRY_OF_MATCH },
    },
  });
  if (!match) throw new NoMatchError();
  return {
    round: match.round,
    outcome: match.outcome,
    reportedById: match.reportedById,
    players: [match.firstEntry.player.userId, match.secondEntry?.player.userId],
    dropped: [match.firstEntry.dropped, !!match.secondEntry?.dropped],
  };
}

/** How many cards the player's mainboard holds: its cards plus its basic lands. */
async function mainboardSize(
  tx: Transaction,
  playerId: string,
): Promise<number> {
  const cards = await tx.plannedCard.count({
    where: { playerId, board: 'Mainboard' },
  });
  const basics = await tx.plannedBasic.aggregate({
    where: { playerId },
    _sum: { count: true },
  });
  return cards + (basics._sum.count ?? 0);
}

/**
 * The tournament entry of the draft's player `userId`. Throws
 * TournamentRefusedError if they haven't joined it.
 */
async function entryOf(
  tx: Transaction,
  tournament: LockedTournament,
  draftId: string,
  userId: string,
): Promise<{ id: string; dropped: boolean }> {
  const entry = await tx.tournamentEntry.findFirst({
    where: { tournamentId: tournament.id, player: { draftId, userId } },
    select: { id: true, dropped: true },
  });
  if (!entry) {
    throw new TournamentRefusedError({
      error: 'not-joined',
      message: 'That player hasn’t joined this tournament.',
    });
  }
  return entry;
}

/**
 * The number of the current tournament round, the latest paired, if the
 * entry `entryId` has neither a match nor a bye in it: for a dropped
 * player, a round paired after their drop, which their forfeits or drop
 * fed. Null while they are in the current round, as round robin's players
 * always are.
 */
async function currentRoundWithout(
  tx: Transaction,
  tournamentId: string,
  entryId: string,
): Promise<number | null> {
  const current = await tx.match.aggregate({
    where: { tournamentId },
    _max: { round: true },
  });
  const round = current._max.round;
  if (round === null) return null;
  const seated = await tx.match.count({
    where: {
      tournamentId,
      round,
      OR: [{ firstEntryId: entryId }, { secondEntryId: entryId }],
    },
  });
  return seated === 0 ? round : null;
}

/** Turns every unplayed match of the entry `entryId`, byes aside, into a forfeit by it. */
async function forfeitUnplayed(tx: Transaction, entryId: string) {
  await tx.match.updateMany({
    where: {
      firstEntryId: entryId,
      secondEntryId: { not: null },
      outcome: 'Unreported',
    },
    data: { outcome: 'Forfeit', forfeitedBy: 'First' },
  });
  await tx.match.updateMany({
    where: { secondEntryId: entryId, outcome: 'Unreported' },
    data: { outcome: 'Forfeit', forfeitedBy: 'Second' },
  });
}
