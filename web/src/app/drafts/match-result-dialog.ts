import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { GameScore } from 'contract';
import type { OrganizerChoices } from './match-lines';

/** The match result dialog's heading's id, which names the dialog. */
export const MATCH_RESULT_HEADING = 'match-result-heading';

/** What the organizer chose in the match result dialog: a game score to set, or to clear it. */
export type MatchResultChoice = { kind: 'GameScore'; games: GameScore } | { kind: 'Clear' };

/**
 * A round robin match's result as an organizer reports, corrects or clears
 * it, opened on the dialog shell from either of its cells in the results
 * grid: the match, "Alice vs Bob", as its heading, a button for each game
 * score, and Clear game score when clearing changes anything. It closes
 * with the organizer's choice, which the Play tab sends, asking first
 * before a clear; Cancel closes it with none.
 */
@Component({
  selector: 'app-match-result-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './match-result-dialog.html',
  styleUrls: ['../dialog.scss', './match-result-dialog.scss'],
})
export class MatchResultDialog {
  private readonly dialogRef = inject<DialogRef<MatchResultChoice>>(DialogRef);

  readonly choices = input.required<OrganizerChoices>();

  protected readonly headingId = MATCH_RESULT_HEADING;

  protected choose(choice?: MatchResultChoice) {
    this.dialogRef.close(choice);
  }
}
