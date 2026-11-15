import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { Changes, ChangeStatus, FocusKey, SendsChange } from '../changes';
import { settled } from '../reread';
import { DraftStore } from './draft-store';
import { cardsNoun, changeFailure, QUEUE_CHANGE_FAILED, queueStateChangeName } from './drafts';
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
 * the queue picks before another player picks, and sets it queue picking,
 * picking them, once the player confirms. Should the api refuse them, as the
 * queue would now pick others, it says so, catches up, and names the cards
 * as they now are to confirm; if there are none, it closes, as there is
 * nothing to ask. Should its cards drop to none otherwise, as when the turn
 * passes while it is open, it closes as Cancel does. It opens on Cancel,
 * which leaves the queue paused, and closes once the change is made, or
 * fails for any other reason.
 */
@Component({
  selector: 'app-queue-picking-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChangeStatus, FocusKey, SendsChange],
  providers: [Changes],
  templateUrl: './queue-picking-dialog.html',
  styleUrls: ['../dialog.scss', './queue-picking-dialog.scss'],
})
export class QueuePickingDialog {
  private readonly queueApi = inject(QueueApi);
  private readonly store = inject(DraftStore);
  private readonly dialogRef = inject<DialogRef<QueuePickingResult>>(DialogRef);
  private readonly changes = inject(Changes);
  private readonly injector = inject(Injector);

  protected readonly headingId = QUEUE_PICKING_HEADING;
  /** The confirm button's text, the name the play/pause button gives the same change. */
  protected readonly confirmName = queueStateChangeName(true);
  /** The cards the queue picks before another player picks, as they are now. */
  protected readonly picks = this.store.queuePicks;
  /** How many cards it picks, as it says it. */
  protected readonly picksText = computed(
    () => `${this.picks().length} ${cardsNoun(this.picks().length)}`,
  );
  /**
   * Whether it opened on a refusal of queue picking with none, as the queue
   * would pick cards after all: the player asked for queue picking already.
   */
  readonly afterRefusal = input(false);
  /**
   * Whether the confirm is busy, ignoring presses: setting it queue picking
   * is on its way, or its cards are being read again, after a refusal or
   * otherwise.
   */
  private readonly busy = this.changes.changing;
  /** Why the cards last confirmed were refused, if they were. */
  protected readonly refused = signal<string | null>(null);
  /** Whether the cards may change before they can be confirmed: they are being read again. */
  protected readonly rereading = this.store.rereadingQueuePicks;
  /**
   * Whether the player asked for queue picking, by a refusal it opened on or
   * by confirming cards since refused, and the re-read since has yet to
   * settle on cards to confirm. Once it has, the cards are what is asked,
   * and none of them is confirmed yet.
   */
  private readonly askedBeforeReread = linkedSignal(() => this.afterRefusal());

  constructor() {
    // While the cards are read again they may change, so the confirm is
    // busy until they settle, keeping focus.
    effect(() => {
      if (!this.rereading()) return;
      // Sent as a change, so the confirm is marked busy and keeps focus while the cards are re-read.
      untracked(() => void this.changes.send(() => this.rereadSettled()));
    });
    // Once the cards settle on none, with the confirm no longer busy, there is
    // nothing to confirm. Should a refusal's re-read settle on none, the
    // player asked for queue picking already, so it is set queue picking with
    // none. Otherwise, as when the turn passes while it is open, the dialog
    // closes as Cancel does: the player confirmed nothing.
    effect(() => {
      if (this.busy() || this.rereading()) return;
      if (this.picks().length > 0) {
        untracked(() => this.askedBeforeReread.set(false));
        return;
      }
      const asked = this.askedBeforeReread();
      untracked(() => this.dialogRef.close(asked ? { outcome: 'none-to-pick' } : undefined));
    });
  }

  protected close() {
    this.dialogRef.close();
  }

  /**
   * Sets the queue queue picking with the cards named, and closes, unless
   * they were refused: then the confirm stays busy, keeping focus, until the
   * cards are read again.
   */
  protected confirm() {
    return this.changes.send(async () => {
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
        this.askedBeforeReread.set(true);
        await this.rereadSettled();
      }
    });
  }

  /** Answers once the cards are no longer being read again, or the dialog has closed. */
  private rereadSettled() {
    return settled(this.rereading, this.injector);
  }
}
