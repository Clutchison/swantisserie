import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DraftStore } from './draft-store';
import { cardsNoun, changeFailure, QUEUE_CHANGE_FAILED } from './drafts';
import { QueueApi } from './queue-api';

/** The Set queue picking dialog's heading's id, which names the dialog. */
export const QUEUE_PICKING_HEADING = 'queue-picking-heading';

/**
 * How the Set queue picking dialog ended, once it did more than cancel: the
 * queue set queue picking, a failure to say, or, after a refusal, nothing
 * left to confirm, as the queue read again picks no cards.
 */
export type QueuePickingResult =
  { outcome: 'made' } | { outcome: 'failed'; message: string } | { outcome: 'none-to-pick' };

/**
 * The Set queue picking dialog, opened on the dialog shell when a player
 * sets their queue to queue picking on their own turn: it names the cards
 * the queue picks before the turn passes, and sets it queue picking,
 * picking them, once the player confirms. Should the api refuse them, as the
 * queue would now pick others, it says so, catches up, and names the cards
 * as they now are to confirm; if there are none, it closes, as there is
 * nothing to ask. It opens on Cancel, which leaves the queue paused, and
 * closes once the change is made, or fails for any other reason.
 */
@Component({
  selector: 'app-queue-picking-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './queue-picking-dialog.html',
  styleUrls: ['../dialog.scss', './queue-picking-dialog.scss'],
})
export class QueuePickingDialog {
  private readonly queueApi = inject(QueueApi);
  private readonly store = inject(DraftStore);
  private readonly dialogRef = inject<DialogRef<QueuePickingResult>>(DialogRef);

  protected readonly headingId = QUEUE_PICKING_HEADING;
  /** The cards the queue picks before the turn passes, as they are now. */
  protected readonly picks = this.store.queuePicks;
  /** How many cards it picks, as it says it. */
  protected readonly picksText = computed(
    () => `${this.picks().length} ${cardsNoun(this.picks().length)}`,
  );
  /** Whether setting it queue picking is on its way. */
  protected readonly sending = signal(false);
  /** Why the cards last confirmed were refused, if they were. */
  protected readonly refused = signal<string | null>(null);
  /** Whether the cards may change before they can be confirmed: they are being read again. */
  protected readonly rereading = this.store.rereadingQueuePicks;

  constructor() {
    // Once a refusal's re-reads settle on no cards to pick, there is nothing to confirm.
    effect(() => {
      if (this.refused() && !this.rereading() && this.picks().length === 0) {
        untracked(() => this.dialogRef.close({ outcome: 'none-to-pick' }));
      }
    });
  }

  protected close() {
    this.dialogRef.close();
  }

  /** Sets the queue queue picking with the cards named, and closes, unless they were refused. */
  protected async confirm() {
    this.sending.set(true);
    this.refused.set(null);
    try {
      await this.store.changeQueue(
        this.queueApi.setQueuePicking(
          this.store.id(),
          this.picks().map((card) => card.poolCardId),
        ),
      );
      this.dialogRef.close({ outcome: 'made' });
    } catch (err) {
      if (!this.store.caughtUpOnQueuePicks(err)) {
        this.dialogRef.close({
          outcome: 'failed',
          message: changeFailure(err, QUEUE_CHANGE_FAILED),
        });
        return;
      }
      this.refused.set(changeFailure(err, QUEUE_CHANGE_FAILED));
      this.sending.set(false);
    }
  }
}
