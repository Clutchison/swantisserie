import { ChangeDetectionStrategy, Component, computed, inject, Injector } from '@angular/core';
import { LucideChevronUp } from '@lucide/angular';
import { DialogShell } from '../dialog-shell';
import { DraftStore } from './draft-store';
import { picksLeftText } from './drafts';
import { QueueAddBump, QueueAddStatus } from './queue-add-status';
import { QueueSheet } from './queue-sheet';

/**
 * The "next up" strip: below the desktop layout, a bar above the tab bar on
 * every tab with the player's queue's size, their picks left, the card it
 * picks next and a dot for an unseen Queue notice. It opens the Queue pane
 * in the Queue sheet, which closes with the strip, as when the page widens
 * to the desktop layout and the pane shows beside the tabs.
 */
@Component({
  selector: 'app-next-up-strip',
  imports: [LucideChevronUp, QueueAddBump, QueueAddStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './next-up-strip.html',
  styleUrl: './next-up-strip.scss',
})
export class NextUpStrip {
  private readonly store = inject(DraftStore);
  private readonly dialogs = inject(DialogShell);
  private readonly injector = inject(Injector);

  /** The queue's size: its count and the noun after it; null until it is known. */
  protected readonly size = this.store.queueSize;
  /** The viewer's picks left, as a viewer reads them; null while there is no count. */
  protected readonly picksLeft = computed(() => {
    const left = this.store.picksLeft();
    return left === null ? null : picksLeftText(left);
  });
  /** The name of the card the queue picks next, its first; null while it is empty or unknown. */
  protected readonly next = computed(() =>
    this.size() ? (this.store.queue.value().cards[0]?.name ?? null) : null,
  );
  /** Whether the Queue notice notes a card the player hasn't yet seen in an open pane. */
  protected readonly unseenNotice = this.store.unseenNotice;

  /** The strip's name: all it shows, in one phrase a screen reader reads at once. */
  protected readonly name = computed(() => {
    const size = this.size();
    const left = this.picksLeft();
    const next = this.next();
    return [
      'Queue',
      ...(size ? [`${size.count} ${size.noun}`] : []),
      ...(left ? [left] : []),
      ...(next ? [`next up ${next}`] : []),
      ...(this.unseenNotice() ? ['new notice'] : []),
    ].join(', ');
  });

  /** Opens the Queue pane over the page, in the Queue sheet; focus comes back here as it closes. */
  protected open() {
    this.dialogs.open(QueueSheet, { label: 'Queue', injector: this.injector });
  }
}
