import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { PlannedCardView, PlanView } from 'contract';
import { DraftStore } from './draft-store';
import { changeFailure } from './drafts';
import { QueueApi } from './queue-api';

const QUEUE_FAILED = "Couldn't add to your queue. Try again in a moment.";

/** The Queue unpicked dialog's heading's id, which names the dialog. */
export const QUEUE_UNPICKED_HEADING = 'queue-unpicked-heading';

/** How Queue unpicked ended, once sent: why it was refused, or null if it was made. */
export interface QueueUnpickedResult {
  error: string | null;
}

/** The pool card ids Queue unpicked adds from each plan board: its unpicked copies the queue doesn't hold. */
export function unpickedToQueue(plan: PlanView, queued: ReadonlySet<string>) {
  const toAdd = (cards: PlannedCardView[]) =>
    cards.filter((card) => !card.picked && !queued.has(card.poolCardId));
  return { mainboard: toAdd(plan.mainboard), sideboard: toAdd(plan.sideboard) };
}

/**
 * The Deck tab's Queue unpicked dialog, opened on the dialog shell: it adds
 * the plan's unpicked cards the queue doesn't hold to the end of the queue,
 * the mainboard's and, if the player includes it, the sideboard's. It
 * opens on Cancel, with the sideboard left out, and closes once it has
 * sent, with how that went.
 */
@Component({
  selector: 'app-queue-unpicked-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './queue-unpicked-dialog.html',
  styleUrls: ['../dialog.scss', './queue-unpicked-dialog.scss'],
})
export class QueueUnpickedDialog {
  private readonly queueApi = inject(QueueApi);
  private readonly store = inject(DraftStore);
  private readonly dialogRef = inject<DialogRef<QueueUnpickedResult>>(DialogRef);

  protected readonly headingId = QUEUE_UNPICKED_HEADING;
  protected readonly includeSideboard = signal(false);
  /** Whether Queue unpicked is on its way. */
  protected readonly sending = signal(false);

  private readonly toQueue = computed(() =>
    unpickedToQueue(this.store.plan.value(), this.store.queued()),
  );
  /** How many cards it adds. */
  protected readonly queueCount = computed(
    () =>
      this.toQueue().mainboard.length +
      (this.includeSideboard() ? this.toQueue().sideboard.length : 0),
  );
  /** How many cards it adds, as it says it. */
  protected readonly queueCountText = computed(
    () => `${this.queueCount()} ${this.queueCount() === 1 ? 'card' : 'cards'}`,
  );

  protected close() {
    this.dialogRef.close();
  }

  /**
   * Adds the cards to the end of the queue, in one request, and closes. A
   * refusal means the queue or turn has moved on: the result says why; the
   * store re-reads the queue.
   */
  protected async queueUnpicked() {
    this.sending.set(true);
    let error: string | null = null;
    try {
      await this.store.changeQueue(
        this.queueApi.addUnpicked(this.store.id(), this.includeSideboard()),
      );
    } catch (err) {
      error = changeFailure(err, QUEUE_FAILED);
    }
    // Sending is never seen again: the dialog closes, however the request went.
    this.dialogRef.close({ error });
  }
}
