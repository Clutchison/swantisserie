import { DialogRef } from '@angular/cdk/dialog';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import type { GameScore } from 'contract';
import type { ClearGameScore } from './match-lines';

/** The match result dialog's heading's id, which names the dialog. */
export const MATCH_RESULT_HEADING = 'match-result-heading';

/** What was chosen in the match result dialog: a game score to set, or to clear it. */
export type MatchResultChoice = { kind: 'GameScore'; games: GameScore } | { kind: 'Clear' };

/** A game score the match result dialog offers. */
type GameScoreChoice = { games: GameScore; label: string; question?: string };

/** What the match result dialog offers for one match. */
export interface MatchResultChoices {
  /** Its heading, such as "Bob vs Carol" or "Your match against Carol". */
  label: string;
  /** Its game scores' name, such as "Game score against Carol"; "Game score of" its label without one. */
  gameScoresLabel?: string;
  /**
   * Each game score it offers: its games, in the match's player order, how
   * it reads, and the question asked before it is chosen, as a player is
   * asked; without one it is chosen at once, as an organizer's is.
   */
  gameScores: GameScoreChoice[];
  /** What a question adds below it, such as who can change a report once it is sent. */
  detail?: string;
  /** Clearing it, unless it already is what clearing leaves; never a player's. */
  clear: ClearGameScore | null;
}

/**
 * A round robin match's result as an organizer reports, corrects or clears
 * it, opened on the dialog shell from either of its cells in the results
 * grid, or as a player reports their own from Your matches: the match as
 * its heading, a button for each game score, and Clear game score when
 * clearing changes anything. A game score with a question asks it first,
 * with Report, Back to the game scores, and Cancel. It closes with the
 * choice, which its opener sends; Cancel closes it with none.
 */
@Component({
  selector: 'app-match-result-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './match-result-dialog.html',
  styleUrls: ['../dialog.scss', './match-result-dialog.scss'],
})
export class MatchResultDialog {
  private readonly dialogRef = inject<DialogRef<MatchResultChoice>>(DialogRef);
  private readonly injector = inject(Injector);

  readonly choices = input.required<MatchResultChoices>();

  protected readonly headingId = MATCH_RESULT_HEADING;
  protected readonly questionId = 'match-result-question';

  /** The game score whose question is asked, with its index, if any. */
  protected readonly asking = signal<(GameScoreChoice & { index: number }) | null>(null);

  private readonly reportButton = viewChild<ElementRef<HTMLButtonElement>>('report');
  private readonly scoreButtons = viewChildren<ElementRef<HTMLButtonElement>>('score');

  /** Chooses the game score at `index`, or asks its question first if it has one. */
  protected pick(index: number) {
    const score = this.choices().gameScores[index];
    if (score.question === undefined) {
      this.choose({ kind: 'GameScore', games: score.games });
      return;
    }
    this.asking.set({ ...score, index });
    this.focusAfterRender(() => this.reportButton());
  }

  /** Goes back from the question to the game scores, focus on the one picked. */
  protected back() {
    // Back shows only while a question is asked.
    const { index } = this.asking()!;
    this.asking.set(null);
    this.focusAfterRender(() => this.scoreButtons()[index]);
  }

  protected choose(choice?: MatchResultChoice) {
    this.dialogRef.close(choice);
  }

  private focusAfterRender(target: () => ElementRef<HTMLElement> | undefined) {
    // Stryker disable next-line OptionalChaining: once rendered, Report or the picked game score's button is always there to focus.
    afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
  }
}
