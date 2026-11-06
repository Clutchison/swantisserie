import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ClearedMatchView } from 'contract';
import { DraftStore } from './draft-store';

/** The correction warning dialog's heading's id, which names the dialog. */
export const CORRECTION_WARNING_HEADING = 'correction-warning-heading';

/** What an organizer is about to do to a match, and the later matches it clears. */
export interface CorrectionWarning {
  /** What it asks, such as "Correct Bob vs Carol?". */
  question: string;
  /** What it leaves the match as, if worth saying, such as "The match is unreported again." */
  detail: string | null;
  /** The button that goes ahead, such as "Correct". */
  action: string;
  clears: ClearedMatchView[];
}

/**
 * The Tournament tab's correction warning, opened on the dialog shell for
 * an organizer correcting or clearing a single elimination match in a way
 * that changes who advances from it: the later matches that clears, from
 * the api's preview, and that the next is paired again. It opens on
 * Cancel, and closes with true once the organizer goes ahead; the tab then
 * sends the change.
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
    this.warning().clears.map(({ round, bracketPlace, players }) => {
      const names = players.map((id) => this.store.player(id).name);
      const match = names.length === 1 ? `${names[0]} has a bye` : names.join(' vs ');
      return { key: `${round}:${bracketPlace}`, label: `Tournament round ${round}: ${match}` };
    }),
  );
  /** Whether the tournament is complete, so clearing its final takes the trophy back. */
  protected readonly takesTrophy = computed(
    () => this.store.tournament.value()?.state === 'Complete',
  );

  protected close(goAhead: boolean) {
    this.dialogRef.close(goAhead);
  }
}
