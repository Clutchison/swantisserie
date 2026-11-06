import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { CorrectionPreview } from 'contract';
import { DraftStore } from './draft-store';
import { versus } from './match-lines';

/** The correction warning dialog's heading's id, which names the dialog. */
export const CORRECTION_WARNING_HEADING = 'correction-warning-heading';

/** What an organizer is about to do to a match, and what the correction preview says it does beyond it. */
export interface CorrectionWarning {
  /** What it asks, such as "Correct Bob vs Carol?". */
  question: string;
  /** What it leaves the match as, if worth saying, such as "The match is unreported again." */
  detail: string | null;
  /** The button that goes ahead, such as "Correct". */
  action: string;
  preview: CorrectionPreview;
}

/**
 * The Play tab's correction warning, opened on the dialog shell for
 * an organizer correcting or clearing a single elimination match in a way
 * that changes who advances from it: the later matches that clears, from
 * the correction preview, and whether it completes the tournament or has
 * a complete one played on. It opens on Cancel, and closes with true once
 * the organizer goes ahead; the tab then sends the change.
 */
@Component({
  selector: 'app-correction-warning-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './correction-warning-dialog.html',
  styleUrl: './correction-warning-dialog.scss',
})
export class CorrectionWarningDialog {
  private readonly store = inject(DraftStore);
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef);

  readonly warning = input.required<CorrectionWarning>();

  protected readonly headingId = CORRECTION_WARNING_HEADING;
  /** Each match it clears as it reads, such as "Tournament round 2: Alice vs Carol". */
  protected readonly clears = computed(() =>
    this.warning().preview.clears.map(({ round, bracketPlace, players }) => ({
      key: `${round}:${bracketPlace}`,
      label: `Tournament round ${round}: ${versus(players.map((id) => this.store.player(id).name))}`,
    })),
  );
  /** How it changes the tournament's state, if it does: it completes it, or has a complete one played on. */
  protected readonly stateChange = computed(() => {
    const before = this.store.tournament.value()?.state;
    const after = this.warning().preview.state;
    if (before === after) return null;
    return after === 'Complete' ? 'completes' : 'plays-on';
  });

  protected close(goAhead: boolean) {
    this.dialogRef.close(goAhead);
  }
}
