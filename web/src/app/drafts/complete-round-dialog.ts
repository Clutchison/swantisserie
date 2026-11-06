import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CompleteRoundRequest } from 'contract';
import { DraftStore } from './draft-store';
import { changeFailure } from './drafts';
import { TournamentApi } from './tournament-api';

const COMPLETE_ROUND_FAILED = "Couldn't complete the tournament round. Try again in a moment.";

/** The Complete round dialog's heading's id, which names the dialog. */
export const COMPLETE_ROUND_HEADING = 'complete-round-heading';

/** How Complete round ended, once sent: why it was refused, or null if it was made. */
export interface CompleteRoundResult {
  error: string | null;
}

/**
 * The Tournament tab's Complete round dialog, opened on the dialog shell
 * for organizers of a Swiss tournament: what completing its current
 * tournament round does, and its unreported matches, which become granted
 * draws, each with a choice of its players to drop, except in the final
 * tournament round. It opens on Cancel, with nobody dropped, and closes
 * once it has sent, with how that went.
 */
@Component({
  selector: 'app-complete-round-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './complete-round-dialog.html',
  styleUrl: './complete-round-dialog.scss',
})
export class CompleteRoundDialog {
  private readonly api = inject(TournamentApi);
  private readonly store = inject(DraftStore);
  private readonly dialogRef = inject<DialogRef<CompleteRoundResult>>(DialogRef);

  protected readonly headingId = COMPLETE_ROUND_HEADING;
  private readonly tournament = this.store.tournament.value;
  /** Whether Complete round is on its way. */
  protected readonly sending = signal(false);

  /** The tournament round it completes: the one after the last completed. */
  protected readonly round = computed(() => (this.tournament()?.lastCompletedRound ?? 0) + 1);
  /** Whether it is the final tournament round, which completes the tournament: then nobody is dropped. */
  protected readonly last = computed(() => this.round() >= (this.tournament()?.roundCount ?? 0));
  /** The round's unreported matches, each with its players as the draft names them. */
  protected readonly unreported = computed(() =>
    (this.tournament()?.rounds.find((r) => r.round === this.round())?.matches ?? [])
      .filter((match) => match.outcome.kind === 'Unreported')
      .map((match) => {
        const players = match.players.map((id) => this.store.player(id));
        return { id: match.id, players, label: `${players[0].name} vs ${players[1].name}` };
      }),
  );
  /** The players chosen to drop, by the id of the match they drop from. */
  private readonly dropping = signal<Record<string, string[]>>({});

  protected isDropping(matchId: string, playerId: string) {
    return this.dropping()[matchId]?.includes(playerId) ?? false;
  }

  /** Chooses whether to drop the player `playerId` as their match `matchId` becomes a granted draw. */
  protected setDropping(matchId: string, playerId: string, drop: boolean) {
    this.dropping.update((chosen) => {
      const others = (chosen[matchId] ?? []).filter((id) => id !== playerId);
      return { ...chosen, [matchId]: drop ? [...others, playerId] : others };
    });
  }

  protected close() {
    this.dialogRef.close();
  }

  /**
   * Completes the round, settling each unreported match as a granted draw
   * with the players chosen to drop from it, and closes. A refusal means the
   * tournament has moved on: the result says why; the store re-reads it.
   */
  protected async completeRound() {
    const request: CompleteRoundRequest = {
      grantedDraws: this.unreported().map((match) => ({
        matchId: match.id,
        drop: this.last() ? [] : (this.dropping()[match.id] ?? []),
      })),
    };
    this.sending.set(true);
    let error: string | null = null;
    try {
      await this.store.changeDraft(this.api.completeRound(this.store.id(), request));
    } catch (err) {
      error = changeFailure(err, COMPLETE_ROUND_FAILED);
    } finally {
      this.sending.set(false);
    }
    this.dialogRef.close({ error });
  }
}
