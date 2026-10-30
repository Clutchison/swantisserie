import {
  type CdkDragDrop,
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import type { QueueView } from './drafts';

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
  private readonly http = inject(HttpClient);

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

  private url() {
    return `/api/drafts/${this.draftId()}/queue`;
  }

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
      this.http.put<QueueView>(this.url(), { oracleIds: cards.map((card) => card.oracleId) }),
    );
  }

  protected remove(oracleId: string) {
    return this.change(
      this.http.delete<QueueView>(`${this.url()}/${encodeURIComponent(oracleId)}`),
    );
  }

  /** Forgets the cards lost to other players. */
  protected dismissLost() {
    return this.change(this.http.delete<QueueView>(`${this.url()}/lost`));
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
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.error.set(err.error?.message ?? CHANGE_FAILED);
      } else {
        this.error.set(CHANGE_FAILED);
      }
      this.queueStale.emit();
    } finally {
      this.changing.set(false);
    }
  }
}
