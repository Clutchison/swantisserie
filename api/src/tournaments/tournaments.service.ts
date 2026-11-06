import { Injectable } from '@nestjs/common';
import {
  MIN_MAINBOARD_CARDS,
  type CompleteRoundRequest,
  type GameScore,
  type GameScorePreview,
  type TournamentRefusal,
  type TournamentSetupRequest,
  type TournamentView,
} from 'contract';
import {
  MIN_UNDROPPED_PLAYERS,
  reportProblem,
  roundRobinSchedule,
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
import type {
  MatchChange,
  RoundSteps,
  TournamentProgress,
} from './round-steps.js';
import { SINGLE_ELIMINATION_STEPS } from './single-elimination.js';
import { SWISS_STEPS } from './swiss-rounds.js';
import {
  createRounds,
  ENTRY_OF_MATCH,
  forfeitUnplayed,
} from './tournament-matches.js';
import {
  NoMatchError,
  NoTournamentError,
  TournamentRefusedError,
} from './tournament-errors.js';
import {
  roundCount,
  TOURNAMENT_VIEW,
  toTournamentView,
} from './tournament-view.js';

/** What a change reads of the tournament it changes. */
interface LockedTournament extends TournamentProgress {
  format: TournamentFormat;
  swissRoundOption: SwissRoundOption | null;
}

const LOCKED_TOURNAMENT = {
  id: true,
  format: true,
  swissRoundOption: true,
  state: true,
  lastCompletedRound: true,
} as const;

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
   * side. In single elimination, changing who advances from a match of a
   * completed tournament round clears the later matches it fed, as its
   * preview lists them.
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
      await changeMatch(tx, tournament, matchId, correction(games, userId));
    });
  }

  /**
   * Clears the match `matchId`'s game score, as an organizer does. While the
   * tournament is playing, a match one of whose players has dropped is their
   * forfeit again, as reinstating a player leaves a match against a player
   * still dropped. Otherwise it is unreported again while its tournament
   * round is open, and a granted draw once its round or the tournament is
   * complete, as completing it would have made it, so a completed round
   * stays completed. Single elimination, which never has a draw, makes it
   * unreported, or the forfeit of a dropped player, whatever the state,
   * clearing the later matches it fed and reopening its tournament round.
   * Throws NoMatchError if the tournament has no such match.
   */
  async clearGameScore(draftId: string, matchId: string): Promise<void> {
    await this.withTournament(draftId, async (tx, tournament) => {
      const match = await findMatch(tx, tournament.id, matchId);
      await changeMatch(tx, tournament, matchId, clearing(tournament, match));
    });
  }

  /**
   * What correcting the match `matchId` to `games`, as the draft's user
   * `userId`, or clearing it when `games` is null, would clear beyond it,
   * changing nothing: in single elimination, the later matches fed by a
   * match of a completed tournament round whose winner it changes. Throws
   * NoTournamentError if the draft has no tournament, NoMatchError if it
   * has no such match, and TournamentRefusedError for a game score a
   * correction refuses.
   */
  async previewGameScore(
    draftId: string,
    matchId: string,
    userId: string,
    games: GameScore | null,
  ): Promise<GameScorePreview> {
    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({
        where: { draftId },
        select: LOCKED_TOURNAMENT,
      });
      if (!tournament) throw new NoTournamentError();
      const match = await findMatch(tx, tournament.id, matchId);
      const problem = games && reportProblem(games);
      if (problem) throw new TournamentRefusedError(problem);
      const change = games
        ? correction(games, userId)
        : clearing(tournament, match);
      const steps = ROUND_STEPS[tournament.format];
      const clears = steps?.previewChange
        ? await steps.previewChange(tx, tournament, matchId, change)
        : [];
      return { clears };
    });
  }

  /**
   * Starts the draft's tournament, closing joining. Round robin makes every
   * match of the round robin schedule of its entries, in join order, byes
   * included, all open at once; Swiss pairs round 1 at random; single
   * elimination seeds its entries at random into the bracket and makes its
   * round 1, byes for the top seeds included. Throws
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
      const steps = ROUND_STEPS[tournament.format];
      if (steps) {
        await steps.start(
          tx,
          tournament.id,
          entries.map((entry) => entry.id),
        );
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
   * TournamentRefusedError if it isn't playing, or plays one tournament
   * round at a time, completing with its final one.
   */
  async complete(draftId: string): Promise<void> {
    await this.inPlay(draftId, async (tx, tournament) => {
      if (tournament.format !== 'RoundRobin') {
        throw new TournamentRefusedError({
          error: 'wrong-format',
          message:
            'This tournament completes when its final tournament round is completed.',
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
   * steps first settle the round as `request` asks; the round must
   * then have no unreported match. It then completes the tournament, which
   * unlocks every deck, after the final tournament round or once fewer than
   * MIN_UNDROPPED_PLAYERS players are still in (undropped, or in single
   * elimination, advancing from the round), and otherwise has the
   * format pair the next tournament round. A completed round stays
   * completed. Throws as the format's round steps do, and
   * TournamentRefusedError if the tournament isn't playing, the round has
   * an unreported match, or it is round robin, which plays every round at
   * once.
   */
  async completeRound(
    draftId: string,
    request: Required<CompleteRoundRequest>,
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
        request,
      });
      await refuseUnreported(tx, tournament.id, round, steps);
      const stillIn = steps.stillIn
        ? await steps.stillIn(tx, tournament.id, round)
        : await tx.tournamentEntry.count({
            where: { tournamentId: tournament.id, dropped: false },
          });
      const completes = finalRound || stillIn < MIN_UNDROPPED_PLAYERS;
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
   * they haven't joined or haven't dropped, the tournament isn't playing,
   * or their drop has fed a later pairing, as their format's round steps
   * decide, by default once a tournament round was paired without them.
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
      const steps = ROUND_STEPS[tournament.format];
      if (steps?.refuseReinstate) {
        await steps.refuseReinstate(tx, tournament, entry.id);
      } else {
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
        select: LOCKED_TOURNAMENT,
      });
      if (!tournament) throw new NoTournamentError();
      await change(draft.tx, tournament);
    });
  }
}

/**
 * The round steps of each format that plays one tournament round at a
 * time; round robin, which plays every round at once, has none.
 */
const ROUND_STEPS: Partial<Record<TournamentFormat, RoundSteps>> = {
  Swiss: SWISS_STEPS,
  SingleElimination: SINGLE_ELIMINATION_STEPS,
};

/**
 * Writes an organizer's `change` to the match `matchId`, through the
 * tournament's format's round steps if they change what depends on it.
 */
async function changeMatch(
  tx: Transaction,
  tournament: LockedTournament,
  matchId: string,
  change: MatchChange,
) {
  const steps = ROUND_STEPS[tournament.format];
  if (steps?.changeMatch) {
    await steps.changeMatch(tx, tournament, matchId, change);
  } else {
    await tx.match.update({ where: { id: matchId }, data: change });
  }
}

/**
 * The change an organizer's correction to `games`, as the user `userId`,
 * writes: unconfirmed, as the opponent hasn't agreed to it.
 */
function correction(games: GameScore, userId: string): MatchChange {
  return {
    outcome: 'GameScore',
    firstGames: games[0],
    secondGames: games[1],
    drawnGames: 0,
    forfeitedBy: null,
    grantedTo: null,
    reportedById: userId,
    confirmed: false,
  };
}

/**
 * The change clearing `match` writes: the forfeit of a player of it who
 * dropped, while the tournament is playing, or always in a format whose
 * clears reopen their tournament round; otherwise unreported while its
 * round is open, and a granted draw once its round or the tournament is
 * complete, unless clears reopen it.
 */
function clearing(
  tournament: LockedTournament,
  { round, dropped }: { round: number; dropped: boolean[] },
): MatchChange {
  const reopens = !!ROUND_STEPS[tournament.format]?.reopensCleared;
  const playing = tournament.state === 'Playing' || reopens;
  const forfeitedBy = !playing
    ? null
    : dropped[0]
      ? ('First' as const)
      : dropped[1]
        ? ('Second' as const)
        : null;
  const roundCompleted =
    tournament.state === 'Complete' || round <= tournament.lastCompletedRound;
  return {
    outcome: forfeitedBy
      ? 'Forfeit'
      : roundCompleted && !reopens
        ? 'GrantedDraw'
        : 'Unreported',
    firstGames: 0,
    secondGames: 0,
    drawnGames: 0,
    forfeitedBy,
    grantedTo: null,
    reportedById: null,
    confirmed: false,
  };
}

/**
 * Throws TournamentRefusedError if tournament round `round` of the
 * tournament `tournamentId` has an unreported match, telling the organizer
 * to settle it as its format's `steps` do.
 */
async function refuseUnreported(
  tx: Transaction,
  tournamentId: string,
  round: number,
  steps: RoundSteps,
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
      message: `Tournament round ${round} has ${unreported} unreported ${unreported === 1 ? 'match' : 'matches'}. Report ${unreported === 1 ? 'it' : 'them'}, or ${steps.settleHint(unreported)}, before completing the tournament round.`,
    });
  }
}

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
