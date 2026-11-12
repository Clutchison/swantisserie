import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DraftStore } from './draft-store';
import { cardsNoun, changeFailure, isRefusal } from './drafts';
import { QueueApi } from './queue-api';

const CHANGE_FAILED = "Couldn't change your queue. Try again in a moment.";

/** The Set queue picking dialog's heading's id, which names the dialog. */
export const QUEUE_PICKING_HEADING = 'queue-picking-heading';

/** How setting the queue picking ended, once sent: why it failed, or null if it was made. */
export interface QueuePickingResult {
  error: string | null;
}

/** Whether `err` is the api's refusal of cards confirmed that the queue would no longer pick. */
export function queuePicksChanged(err: unknown): boolean {
  return isRefusal(err) && err.error?.error === 'queue-picks-changed';
}

/**
 * The Set queue picking dialog, opened on the dialog shell when a player
 * sets their queue picking on their own turn: it names the cards the queue
 * picks before the turn passes, and sets it picking, picking them, once the
 * player confirms. Should the api refuse them, as the queue would now pick
 * others, it says so, catches up, and names the cards as they now are to
 * confirm. It opens on Cancel, which leaves the queue paused, and closes
 * once the change is made, or fails for any other reason, with how it went.
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
  /** Whether setting it picking is on its way. */
  protected readonly sending = signal(false);
  /** Why the cards last confirmed were refused, if they were. */
  protected readonly refused = signal<string | null>(null);
  /** Whether the cards may change before they can be confirmed: they are being read again. */
  protected readonly rereading = this.store.rereadingQueuePicks;

  protected close() {
    this.dialogRef.close();
  }

  /** Sets the queue picking with the cards named, and closes, unless they were refused. */
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
      this.dialogRef.close({ error: null });
    } catch (err) {
      if (!queuePicksChanged(err)) {
        this.dialogRef.close({ error: changeFailure(err, CHANGE_FAILED) });
        return;
      }
      // The queue is being read again already; the turn may have moved on too.
      this.store.catchUp();
      this.refused.set(changeFailure(err, CHANGE_FAILED));
      this.sending.set(false);
    }
  }
}
