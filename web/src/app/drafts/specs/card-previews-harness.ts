import { TestBed } from '@angular/core/testing';
import type { PickView, PlanView, PoolCardView, QueueView, UserView } from 'contract';
import {
  alice,
  alicePlayer,
  bob,
  completeSnapshot,
  openDraft,
  pickOf,
  pointer,
  poolCardOf,
  queued,
  queueOf,
  openQueueSheet,
  tabButton,
} from './harness';

export const bolt = poolCardOf('bolt', 'Lightning Bolt');
export const shock = poolCardOf('shock', 'Shock');

export const pick = (number: number, card: PoolCardView, playerId = alice.id): PickView =>
  pickOf({
    pick: number,
    playerId,
    poolCardId: card.id,
  });

/** Opens a draft with `picks` made and `options` as openDraft takes them: Bolt picked by Alice and Shock by Bob, unless told otherwise. */
export async function openPicked(
  options: {
    cards?: PoolCardView[];
    picks?: PickView[];
    queue?: QueueView;
    plan?: PlanView;
    user?: UserView;
  } = {},
) {
  return openDraft(
    completeSnapshot,
    {
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 3, round: 1, playerId: bob.id },
    },
    { cards: [bolt, shock], picks: [pick(1, bolt), pick(2, shock, bob.id)], ...options },
  );
}

/** Opens the Board tab of a draft with picks, then takes over the clock. */
export async function openBoard(options: Parameters<typeof openPicked>[0] = {}) {
  const opened = await openPicked(options);
  tabButton(opened.page, 'Board').click();
  await opened.fixture.whenStable();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return opened;
}

/**
 * Opens the Queue sheet of a draft whose pool has only Shock, with Bolt then
 * Shock queued, then takes over the clock; returns the sheet too. A queue
 * names its cards, so Bolt shows a name with no pool card.
 */
export async function openQueueWithoutBolt() {
  const opened = await openPicked({
    cards: [shock],
    picks: [],
    queue: queueOf({ cards: [queued(bolt), queued(shock)] }),
  });
  const sheet = await openQueueSheet(opened.fixture, opened.page);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return { ...opened, sheet };
}

/** The mouse comes to rest on `name`. */
export function hover(name: HTMLElement) {
  name.dispatchEvent(pointer('pointerenter', 'mouse'));
}

/** The mouse leaves `name`, and what came of it renders. */
export function unhover(name: HTMLElement) {
  name.dispatchEvent(pointer('pointerleave', 'mouse'));
  TestBed.tick();
}

/**
 * The symbols a viewer reads before the card name `name`, beside it: its mana
 * cost, each symbol by its alt text, or its text if it has no SVG.
 */
export const costBefore = (name: HTMLElement) =>
  [...name.parentElement!.querySelectorAll<HTMLElement>('img, span')]
    .filter(
      (symbol) =>
        symbol.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING &&
        !name.contains(symbol) &&
        (symbol instanceof HTMLImageElement ||
          (symbol.children.length === 0 && symbol.textContent.trim() !== '')),
    )
    .map((symbol) => (symbol instanceof HTMLImageElement ? symbol.alt : symbol.textContent));
