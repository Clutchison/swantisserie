import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MIN_MAINBOARD_CARDS } from 'contract';
import { DraftStore } from './draft-store';

/**
 * The reminder a joined player sees during registration, on the Play tab
 * and their Deck tab: their deck locks when the tournament starts. It
 * warns them too when their mainboard holds fewer than
 * MIN_MAINBOARD_CARDS, which the api refuses Start for. Shows nothing to
 * anyone else, nor outside registration.
 */
@Component({
  selector: 'app-deck-lock-reminder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.deckLocksAtStart()) {
      <p class="detail">
        Your deck locks when the tournament starts, until it is complete or cancelled.
      </p>
      @if (store.deckTooSmall()) {
        <p class="warning">
          Your mainboard holds {{ store.mainboardCards() }}
          {{ store.mainboardCards() === 1 ? 'card' : 'cards' }}. A tournament deck needs at least
          {{ minimum }}: fill your deck before marking yourself ready, or leave the tournament if
          you won’t play.
        </p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .detail {
      color: var(--color-muted);
      font-size: var(--font-size-sm);
    }

    .warning {
      padding: var(--space-sm) var(--space-md);
      border-radius: 0.25rem;
      background: var(--color-warning-surface);
      color: var(--color-warning-text);
      font-size: var(--font-size-sm);
    }
  `,
})
export class DeckLockReminder {
  /** The signed-in player's deck and tournament entry. */
  protected readonly store = inject(DraftStore);
  /** The fewest mainboard cards Start accepts. */
  protected readonly minimum = MIN_MAINBOARD_CARDS;
}
