import {
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  Injectable,
  linkedSignal,
} from '@angular/core';
import { DraftStore } from './draft-store';

/** The events that count as the viewer pressing: a pointer press or a key press, not a move, scroll or focus. */
const PRESSES = ['pointerdown', 'keydown'] as const;

/**
 * Where the draft's turn stands for the viewer: the pick that started it,
 * which a double turn's second pick shares, whether it is drafting, and
 * whether it is theirs.
 */
interface TurnState {
  readonly pick: number | null;
  readonly drafting: boolean;
  readonly own: boolean;
}

/**
 * Whether the viewer's own ring in the Seat strip loops its pulse: on their
 * turn while the draft is drafting, from the moment the turn reaches them,
 * or resumes with them, until they press a pointer or a key anywhere on the
 * page. One for the page, so the strip keeps it as it moves between the tab
 * bar and the row under the draft header.
 */
@Injectable()
export class OwnTurnLoop {
  private readonly store = inject(DraftStore);

  private readonly turnState = computed<TurnState>(
    () => ({
      pick: this.store.turnStartPick(),
      drafting: this.store.draft.value()?.state === 'Drafting',
      own: this.store.yourTurn(),
    }),
    {
      equal: (a, b) => a.pick === b.pick && a.drafting === b.drafting && a.own === b.own,
    },
  );

  /**
   * The start pick of the turn on which the viewer pressed, stopping the
   * loop; null while they haven't. Each new turn, and each return to drafting, clears
   * it, except at the turnaround: a pick they pressed to make by hand that
   * leaves the turn with them doesn't start the loop again.
   */
  private readonly pressedOn = linkedSignal<TurnState, number | null>({
    source: this.turnState,
    computation: (now, before) => {
      const was = before?.source;
      const turnaround = !!was && was.drafting && was.own && now.drafting && now.own;
      return turnaround && before.value === was.pick ? now.pick : null;
    },
  });

  /** Whether the viewer's ring is finishingBeat the beat it was on as they pressed. */
  private readonly finishingBeat = linkedSignal<TurnState, boolean>({
    source: this.turnState,
    computation: () => false,
  });

  /** Whether the viewer's turn calls for the loop: they haven't pressed since it reached them. */
  private readonly awaitingPress = computed(() => {
    const { pick, drafting, own } = this.turnState();
    return drafting && own && this.pressedOn() !== pick;
  });

  /** Whether the viewer's own ring pulses on, beat after beat, or finishes the beat it is on. */
  readonly looping = computed(() => this.awaitingPress() || this.finishingBeat());

  constructor() {
    // A linkedSignal recomputes only when read, against the source it last
    // saw: read as each change to the turn settles, they see the turn leave
    // the viewer and come back, as nothing else reads them while it's away.
    effect(() => {
      this.pressedOn();
      this.finishingBeat();
    });
    const document = inject(DOCUMENT);
    // Captured, so a press nothing on the page lets through still counts.
    const press = () => this.press();
    for (const type of PRESSES) {
      document.addEventListener(type, press, { capture: true });
    }
    inject(DestroyRef).onDestroy(() => {
      for (const type of PRESSES) {
        document.removeEventListener(type, press, { capture: true });
      }
    });
  }

  /** A beat of the viewer's ring has ended: one they pressed during is its last. */
  beatEnded() {
    this.finishingBeat.set(false);
  }

  private press() {
    if (!this.awaitingPress()) return;
    this.pressedOn.set(this.turnState().pick);
    this.finishingBeat.set(true);
  }
}
