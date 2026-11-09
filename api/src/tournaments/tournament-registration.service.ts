import { Injectable } from '@nestjs/common';
import { MIN_TOURNAMENT_PLAYERS, type TournamentSetupRequest } from 'contract';
import { roundRobinMatches } from 'engine';
import { NotAPlayerError } from '../drafts/draft-errors.js';
import { DraftLock } from '../drafts/draft-lock.js';
import type { DraftEvent } from '../drafts/draft-events.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import { snapshotDecklists } from './decklists.service.js';
import {
  deckRefusal,
  joinRefusal,
  JOINING_PLAYER,
  STARTING_PLAYER,
} from './join-rules.js';
import { ROUND_STEPS } from './format-steps.js';
import { NOT_JOINED, READYING_PLAYER, readyRefusal } from './ready-rules.js';
import { createMatches } from './tournament-matches.js';
import { tournamentSetUp, tournamentStarted } from './tournament-events.js';
import { TournamentRefusedError } from './tournament-errors.js';
import { entryOf, TournamentLock } from './tournament-lock.js';

/**
 * A complete draft's tournament from setup through registration: setting
 * it up, players joining and leaving, and starting it; and cancelling it,
 * during registration or play. Starting under the draft's lock also waits
 * for any plan write in flight, which share-locks the draft, so a deck
 * can't change as it is checked and locked.
 */
@Injectable()
export class TournamentRegistrationService {
  constructor(
    private readonly draftLock: DraftLock,
    private readonly tournamentLock: TournamentLock,
  ) {}

  /**
   * Sets up the draft's tournament as `setup` chooses, in registration,
   * and joins every one of the draft's players to it, whatever their decks
   * hold, returning its announcement. Throws TournamentRefusedError unless the
   * draft is complete and has none yet.
   */
  async setUp(
    draftId: string,
    setup: TournamentSetupRequest,
  ): Promise<DraftEvent[]> {
    return this.draftLock.whileIn(
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
        const tournament = await tx.tournament.create({
          data: {
            draftId,
            format: setup.format,
            swissRoundOption:
              setup.format === 'Swiss' ? setup.swissRoundOption : null,
            publicDecklists: setup.publicDecklists,
          },
          select: { id: true },
        });
        await joinEveryone(tx, draftId, tournament.id);
        return [await tournamentSetUp(tx, draftId, setup.format)];
      },
    );
  }

  /**
   * Joins the user to the draft's tournament again, after they left or
   * were removed, whatever their deck holds. Throws NotAPlayerError if they
   * aren't one of the draft's players, and TournamentRefusedError if they
   * are a bot, have joined already, or the tournament is past registration.
   */
  async join(draftId: string, userId: string): Promise<void> {
    await this.tournamentLock.inRegistration(
      draftId,
      async (tx, tournament) => {
        const player = await tx.player.findUnique({
          where: { draftId_userId: { draftId, userId } },
          select: { id: true, ...JOINING_PLAYER },
        });
        if (!player) throw new NotAPlayerError('tournaments');
        const refusal = joinRefusal(player);
        if (refusal) throw new TournamentRefusedError(refusal);
        await tx.tournamentEntry.create({
          data: { tournamentId: tournament.id, playerId: player.id },
        });
      },
    );
  }

  /**
   * Takes the draft's player `userId` out of its tournament: they leave,
   * or an organizer removes them. Throws
   * TournamentRefusedError if they haven't joined or are a bot, or the
   * tournament is past registration.
   */
  async removeEntry(draftId: string, userId: string): Promise<void> {
    await this.tournamentLock.inRegistration(
      draftId,
      async (tx, tournament) => {
        const entry = await entryOf(tx, tournament, draftId, userId);
        await tx.tournamentEntry.delete({ where: { id: entry.id } });
      },
    );
  }

  /**
   * Marks the draft's player `userId` ready, or unmarks them, as `ready`
   * says: their own tournament entry only, as only the player changes
   * their ready. Marking an already ready player ready, or unmarking one who
   * isn't, changes nothing. Throws TournamentRefusedError if they haven't
   * joined, or the tournament is past registration; and on marking, if they
   * are a bot or their mainboard holds fewer than MIN_MAINBOARD_CARDS, as
   * `readyRefusal` decides. Nothing is announced.
   */
  async setReady(
    draftId: string,
    userId: string,
    ready: boolean,
  ): Promise<void> {
    await this.tournamentLock.inRegistration(draftId, async (tx) => {
      const player = await tx.player.findUnique({
        where: { draftId_userId: { draftId, userId } },
        select: READYING_PLAYER,
      });
      const entry = player?.tournamentEntry;
      if (!entry) throw new TournamentRefusedError(NOT_JOINED);
      const refusal = ready ? readyRefusal(player) : null;
      if (refusal) throw new TournamentRefusedError(refusal);
      await tx.tournamentEntry.update({
        where: { id: entry.id },
        data: { ready },
      });
    });
  }

  /**
   * Cancels the draft's tournament during registration or play, deleting it
   * with its entries and matches, so nothing from it counts and every deck
   * it locked unlocks. Throws TournamentRefusedError once it is complete.
   */
  async cancel(draftId: string): Promise<void> {
    await this.tournamentLock.withTournament(
      draftId,
      async (tx, tournament) => {
        if (tournament.state === 'Complete') {
          throw new TournamentRefusedError({
            error: 'tournament-complete',
            message:
              'A complete tournament can’t be cancelled. Its results are final.',
          });
        }
        await tx.tournament.delete({ where: { id: tournament.id } });
      },
    );
  }

  /**
   * Starts the draft's tournament, closing joining and locking every joined
   * player's deck. Round robin makes the
   * match of every pair of its entries, by join order, all open at once and
   * with no byes; Swiss pairs round 1 at random; single
   * elimination seeds its entries at random into the bracket and makes its
   * round 1, byes for the top seeds included. Throws
   * TournamentRefusedError if fewer than MIN_TOURNAMENT_PLAYERS have
   * joined, if a joined human player's mainboard holds fewer than
   * MIN_MAINBOARD_CARDS, or if it is past registration. Returns its
   * announcement.
   */
  async start(draftId: string): Promise<DraftEvent[]> {
    return this.tournamentLock.inRegistration(
      draftId,
      async (tx, tournament) => {
        const entries = await tx.tournamentEntry.findMany({
          where: { tournamentId: tournament.id },
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          select: { id: true, player: { select: STARTING_PLAYER } },
        });
        if (entries.length < MIN_TOURNAMENT_PLAYERS) {
          throw new TournamentRefusedError({
            error: 'too-few-players-joined',
            message: `A tournament needs at least ${MIN_TOURNAMENT_PLAYERS} players to start.`,
          });
        }
        const refusal = deckRefusal(entries.map((entry) => entry.player));
        if (refusal) throw new TournamentRefusedError(refusal);
        await tx.tournament.update({
          where: { id: tournament.id },
          data: { state: 'Playing', startedAt: new Date() },
        });
        await snapshotDecklists(tx, tournament.id);
        const steps = ROUND_STEPS[tournament.format];
        if (steps) {
          await steps.start(
            tx,
            tournament.id,
            entries.map((entry) => entry.id),
          );
        } else {
          // Round robin has no tournament rounds: its matches are kept as round 1's.
          const matches = roundRobinMatches(entries.map((entry) => entry.id));
          await createMatches(
            tx,
            tournament.id,
            1,
            matches.map((players) => ({ players })),
          );
        }
        return [await tournamentStarted(tx, draftId, tournament.id)];
      },
    );
  }
}

/**
 * Joins every one of the draft's players, humans and bots, to its new
 * tournament `tournamentId`, in seat order, whatever their decks hold:
 * nobody has to remember to join, and a player who won't play leaves. Start
 * checks the humans' decks; bots exist for testing, and an admin testing
 * alone needs players to pair against.
 */
async function joinEveryone(
  tx: Transaction,
  draftId: string,
  tournamentId: string,
) {
  const players = await tx.player.findMany({
    where: { draftId },
    orderBy: [{ seat: 'asc' }, { joinedAt: 'asc' }],
    select: { id: true },
  });
  // A millisecond apart, so join order is seat order.
  const now = Date.now();
  await tx.tournamentEntry.createMany({
    data: players.map((player, i) => ({
      tournamentId,
      playerId: player.id,
      joinedAt: new Date(now + i),
    })),
  });
}
