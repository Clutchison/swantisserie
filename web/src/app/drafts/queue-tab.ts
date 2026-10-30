import {
  type CdkDragDrop,
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import type { QueueView } from './drafts';
import { QueueApi, queueChangeFailure } from './queue-api';

const CHANGE_FAILED = "Couldn't change your queue. Try again in a moment.";

/** The draft view's Queue tab: the signed-in player's queue, which they reorder and prune. */
@Component({
  selector: 'app-queue-tab',
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './queue-tab.html',
  styleUrls: ['./drafts.scss', './queue-tab.scss'],
})
export class QueueTab {
  private readonly queueApi = inject(QueueApi);

  /** A draft the signed-in user is playing in. */
  readonly draftId = input.required<string>();
  /** The signed-in player's queue. */
  readonly queue = input.required<QueueView>();
  /** The queue as a change made it. */
  readonly queueChanged = output<QueueView>();
  /** A change failed, so the queue may have moved on unseen; it should be re-read. */
  readonly queueStale = output<void>();

  protected readonly changing = signal(false);
  protected readonly error = signal<string | null>(null);

  /** A card dragged to a new place in the queue. */
  protected dropped(event: CdkDragDrop<unknown>) {
    return this.move(event.previousIndex, event.currentIndex);
  }

  /** Moves the card at `from` to `to`, showing the new order at once. */
  protected move(from: number, to: number) {
    if (from === to) return;
    const cards = [...this.queue().cards];
    moveItemInArray(cards, from, to);
    this.queueChanged.emit({ ...this.queue(), cards });
    return this.change(
      this.queueApi.reorder(
        this.draftId(),
        cards.map((card) => card.oracleId),
      ),
    );
  }

  protected remove(oracleId: string) {
    return this.change(this.queueApi.remove(this.draftId(), oracleId));
  }

  /** Forgets the cards lost to other players. */
  protected dismissLost() {
    return this.change(this.queueApi.dismissLost(this.draftId()));
  }

  /**
   * Sends a change to the queue and shows the queue it answers with. A
   * refused change means the queue has moved on, e.g. a card was lost:
   * say why, and re-read it.
   */
  private async change(request: Observable<QueueView>) {
    this.changing.set(true);
    this.error.set(null);
    try {
      this.queueChanged.emit(await firstValueFrom(request));
    } catch (err) {
      this.error.set(queueChangeFailure(err, CHANGE_FAILED));
      this.queueStale.emit();
    } finally {
      this.changing.set(false);
    }
  }
}
