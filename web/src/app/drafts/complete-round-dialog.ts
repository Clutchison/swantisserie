import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CompleteRoundRequest } from 'contract';
import { MIN_PLAYERS_LEFT, roundCompletion, type BracketResult } from 'engine';
import { DraftStore } from './draft-store';

/** The Complete round dialog's heading's id, which names the dialog. */
export const COMPLETE_ROUND_HEADING = 'complete-round-heading';

/** How a match of a single elimination tournament round was decided, or will be. */
type Outcome = NonNullable<BracketResult['outcome']>;

/** Single elimination, as the forecast names it. */
// Stryker disable next-line StringLiteral: `roundCompletion` tells the formats apart only by whether they are Swiss.
const SINGLE_ELIMINATION = 'SingleElimination';

/**
 * The Play tab's Complete round dialog, opened on the dialog shell
 * for organizers of a Swiss or single elimination tournament: what
 * completing the tournament round it was opened for does, and its unreported
 * matches, as the read's `completeRoundGrants` says. In Swiss they become
 * granted draws, each with a choice of its players to drop, those the read
 * says are droppable, except in the final tournament round. In single elimination, which never
 * has a draw, the organizer picks each one's winner, who gets a granted
 * win, or drops one or both of its droppable players, which makes it their
 * forfeit, before the round can be completed. It opens on Cancel, with
 * nobody dropped or picked, and closes with the request to send once the
 * organizer completes the round; the tab sends it.
 */
@Component({
  selector: 'app-complete-round-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './complete-round-dialog.html',
  styleUrls: ['../dialog.scss', './complete-round-dialog.scss'],
})
export class CompleteRoundDialog {
  private readonly store = inject(DraftStore);
  private readonly dialogRef = inject<DialogRef<CompleteRoundRequest>>(DialogRef);

  protected readonly headingId = COMPLETE_ROUND_HEADING;
  protected readonly minPlayersLeft = MIN_PLAYERS_LEFT;
  /**
   * The tournament read: the dialog opens only on one that has its
   * tournament round, and the Play tab closes it once that tournament round
   * stops being current or the tournament is gone.
   */
  private readonly tournament = this.store.tournament.value;

  /** Whether Complete round gives granted wins, as single elimination does: each unreported match needs a winner picked. */
  protected readonly grantsWins = computed(
    () => this.tournament()!.completeRoundGrants === 'GrantedWins',
  );
  /** The tournament round it completes: the one it was opened for, which its request names. */
  readonly round = input.required<number>();
  /** Whether it is the final tournament round, which completes the tournament: then nobody is dropped. */
  protected readonly finalRound = computed(() => {
    const completion = this.completion();
    return completion.completes && completion.reason === 'FinalRound';
  });
  /**
   * The round's unreported matches, each with its players as the draft
   * names them, and those of them the tournament says can be dropped.
   */
  protected readonly unreported = computed(() => {
    const droppable = new Set(
      this.tournament()!
        .entries.filter((entry) => entry.droppable)
        .map((entry) => entry.playerId),
    );
    return this.tournament()!
      .rounds.find((r) => r.round === this.round())!
      .matches.filter((match) => match.outcome.kind === 'Unreported')
      .map((match) => {
        const players = match.players.map((id) => this.store.player(id));
        return {
          id: match.id,
          players,
          droppable: players.filter((player) => droppable.has(player.id)),
          label: `${players[0].name} vs ${players[1].name}`,
        };
      });
  });
  /** The players chosen to drop, by the id of the match they drop from. */
  private readonly dropping = signal<Record<string, string[]>>({});
  /** In single elimination, the winner picked for each unreported match, by its id. */
  private readonly winners = signal<Record<string, string>>({});
  /**
   * Whether the round can be completed: in single elimination, once every
   * unreported match has a winner picked or a player chosen to drop.
   */
  protected readonly ready = computed(
    () =>
      !this.grantsWins() ||
      this.unreported().every((match) => !!this.winners()[match.id] || this.drops(match.id)),
  );
  /**
   * What completing the round will do, as the engine's roundCompletion
   * forecasts it from the tournament with the organizer's picks: the
   * players chosen to drop counted as dropped, and in single elimination
   * each unreported match decided as the organizer decides it.
   */
  protected readonly completion = computed(() => {
    const tournament = this.tournament()!;
    const chosen = Object.values(this.dropping()).flat();
    const entries = tournament.entries.map(({ playerId, dropped }) => ({
      playerId,
      dropped: dropped || chosen.includes(playerId),
    }));
    const round = this.round();
    const { roundCount } = tournament;
    return roundCompletion(
      this.grantsWins()
        ? { format: SINGLE_ELIMINATION, round, roundCount, entries, results: this.results() }
        : { format: 'Swiss', round, roundCount, entries },
    );
  });

  /**
   * In single elimination, the round's matches and byes as the organizer
   * decides them: each unreported match a granted win for whoever they pick
   * (one is, before the round can be completed) or the forfeit of the
   * players chosen to drop.
   */
  private readonly results = computed(() => {
    const round = this.tournament()!.rounds.find((r) => r.round === this.round())!;
    const matches = round.matches.map(({ id, players, outcome }): BracketResult => {
      if (outcome.kind !== 'Unreported') return { players, outcome };
      // Stryker disable next-line ArrayDeclaration: a forfeit by an unknown id still sends one player on, as the granted win does.
      const dropping = this.dropping()[id] ?? [];
      const forfeit = dropping.map((forfeitedBy): Outcome => ({ kind: 'Forfeit', forfeitedBy }))[0];
      // Stryker disable next-line LogicalOperator: the forecast counts only how many players advance, and a granted win sends one on whoever wins it.
      const winner = this.winners()[id] ?? players[0];
      // Stryker disable next-line ObjectLiteral,StringLiteral: the forecast counts only how many players advance, and a granted win sends one on whoever wins it.
      const grantedWin: Outcome = { kind: 'GrantedWin', winner };
      return { players, outcome: forfeit ?? grantedWin };
    });
    const byes = round.byes.map((id): BracketResult => ({
      players: [id, null],
      outcome: null,
    }));
    return [...matches, ...byes];
  });

  // Stryker disable next-line BlockStatement: the checkbox keeps the state the organizer clicked; the binding shows only if a re-read re-creates it.
  protected isDropping(matchId: string, playerId: string) {
    // Stryker disable next-line LogicalOperator: the checkbox keeps the state the organizer clicked; the binding shows only if a re-read re-creates it.
    return this.dropping()[matchId]?.includes(playerId) ?? false;
  }

  /** Whether any player of the match `matchId` is chosen to drop. */
  protected drops(matchId: string) {
    return (this.dropping()[matchId] ?? []).length > 0;
  }

  /**
   * Chooses whether to drop the player `playerId` from their match
   * `matchId`: as it becomes a granted draw in Swiss, or instead of
   * picking its winner in single elimination.
   */
  protected setDropping(matchId: string, playerId: string, drop: boolean) {
    this.dropping.update((chosen) => {
      const others = (chosen[matchId] ?? []).filter((id) => id !== playerId);
      return { ...chosen, [matchId]: drop ? [...others, playerId] : others };
    });
  }

  // Stryker disable next-line BlockStatement: the radio button keeps the state the organizer clicked; the binding shows only if a re-read re-creates it.
  protected isWinner(matchId: string, playerId: string) {
    // Stryker disable next-line ConditionalExpression: the radio button keeps the state the organizer clicked; the binding shows only if a re-read re-creates it.
    return this.winners()[matchId] === playerId;
  }

  /** Picks the player `playerId` to win the unreported match `matchId`. */
  protected pickWinner(matchId: string, playerId: string) {
    this.winners.update((picked) => ({ ...picked, [matchId]: playerId }));
  }

  protected close() {
    this.dialogRef.close();
  }

  /**
   * Closes with the request, naming its tournament round: in single
   * elimination the drops chosen from
   * each unreported match, and a granted win for the winner picked in each
   * of the others; otherwise a granted draw in each, with the players
   * chosen to drop from it.
   */
  protected completeRound() {
    if (this.grantsWins()) {
      const dropping = this.unreported().filter((match) => this.drops(match.id));
      const won = this.unreported().filter((match) => !this.drops(match.id));
      this.dialogRef.close({
        round: this.round(),
        ...(won.length > 0 && {
          grantedWins: won.map((match) => ({
            matchId: match.id,
            winner: this.winners()[match.id],
          })),
        }),
        ...(dropping.length > 0 && {
          drops: dropping.map((match) => ({
            matchId: match.id,
            drop: this.dropping()[match.id],
          })),
        }),
      });
      return;
    }
    this.dialogRef.close({
      round: this.round(),
      grantedDraws: this.unreported().map((match) => ({
        matchId: match.id,
        drop: this.dropping()[match.id] ?? [],
      })),
    });
  }
}
