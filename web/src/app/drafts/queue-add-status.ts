import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  type Signal,
  untracked,
} from '@angular/core';
import { DraftStore, type QueueAdd } from './draft-store';

/**
 * The latest card added to the queue from a Card detail since the caller
 * was made, so one made after an add doesn't take it for a new one; null
 * before one. Call it where `inject` works.
 */
export function queueAddsFromNow(): Signal<QueueAdd | null> {
  const latest = inject(DraftStore).latestQueueAdd;
  const before = untracked(latest)?.id ?? 0;
  return computed(() => {
    const add = latest();
    return add && add.id > before ? add : null;
  });
}

/**
 * Says the queue's size, as "Queue, 12 cards", each time a card is added to
 * it from a Card detail: a polite live region beside the count the Queue
 * pane's header, its rail or the "next up" strip shows. Only one is on the
 * page at a time, so an add is said once.
 */
@Component({
  selector: 'app-queue-add-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Always there, so screen readers say each add as it appears; each add's
  // text is new, so the same size said again is said.
  template: `<p class="visually-hidden" role="status">
    @for (add of adds(); track add.id) {
      Queue, {{ add.size.count }} {{ add.size.noun }}
    }
  </p>`,
})
export class QueueAddStatus {
  private readonly latest = queueAddsFromNow();
  protected readonly adds = computed(() => {
    const add = this.latest();
    return add ? [add] : [];
  });
}

/**
 * Bumps the queue's count it is put on each time a card is added from a
 * Card detail: it gives the element the `bump` class afresh, which
 * `_queue-add-bump.scss` animates unless the viewer prefers reduced motion.
 */
@Directive({ selector: '[appQueueAddBump]' })
export class QueueAddBump {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const added = queueAddsFromNow();
    effect(() => {
      if (!added()) return;
      element.classList.remove('bump');
      // Reading its layout ends the last bump, so taking the class again starts another.
      void element.offsetWidth;
      element.classList.add('bump');
    });
  }
}
