import {
  type CdkDragDrop,
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
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
  /** The draft's version: the queue is re-read when it changes, as a pick may have lost a card. */
  readonly version = input.required<number>();

  private readonly resource = httpResource<QueueView>(() => this.url());
  protected readonly queue = computed<QueueView>(() =>
    this.resource.hasValue() ? this.resource.value() : { cards: [], lost: [] },
  );
  protected readonly failed = computed(() => !!this.resource.error());
  protected readonly changing = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    let shown: number | undefined;
    effect(() => {
      const version = this.version();
      untracked(() => {
        if (shown !== undefined && version !== shown) this.resource.reload();
        shown = version;
      });
    });
  }

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
    this.resource.set({ ...this.queue(), cards });
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
      this.resource.set(await firstValueFrom(request));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.error.set(err.error?.message ?? CHANGE_FAILED);
      } else {
        this.error.set(CHANGE_FAILED);
      }
      this.resource.reload();
    } finally {
      this.changing.set(false);
    }
  }
}
