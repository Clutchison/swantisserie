import { DestroyRef, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import type { DraftView, TurnView } from 'contract';
import { draftSize, picksPerTurn, type DraftSize } from 'engine';

/** Whether it is the turn of the player `playerId` in `draft`; false with no turn or no player. */
export function isTurnOf(draft: DraftView, playerId: string | undefined): boolean {
  return !!draft.turn && draft.turn.playerId === playerId;
}

/** Whether the turns of round `round`, in a draft of size `size`, are double turns. */
export function isDoubleTurnRound(size: DraftSize, round: number): boolean {
  return picksPerTurn(size, round) === 2;
}

/** Whether `draft`'s turn is a double turn, on either of its picks; false with no turn. */
export function isDoubleTurn(draft: DraftView): boolean {
  return (
    !!draft.turn && isDoubleTurnRound(draftSize(draft, draft.players.length), draft.turn.round)
  );
}

/**
 * What a turn's text adds on a double turn: the picks still to make before
 * it passes. A single turn adds nothing, so only a double turn calls this.
 */
export function doubleTurnSuffix(picksBeforeTurnPasses: 1 | 2) {
  return picksBeforeTurnPasses === 2 ? ' · 2 picks' : ' · 1 more pick';
}

/**
 * Where a draft with a turn has got to: its pick and round, and on a double
 * turn the picks still to make before it passes, as in "pick 5, round 3 · 2
 * picks". It starts lower case, for the middle of a sentence.
 */
export function pickAndRound(draft: DraftView): string {
  return turnWords(draft.turn!, isDoubleTurn(draft));
}

/**
 * A turn's pick and round, worded as `pickAndRound` words a draft's, for a
 * turn that isn't the draft's own, such as a pick import preview's next one.
 */
export function turnWords(
  turn: Pick<TurnView, 'pick' | 'round' | 'picksBeforeTurnPasses'>,
  doubleTurn: boolean,
): string {
  const suffix = doubleTurn ? doubleTurnSuffix(turn.picksBeforeTurnPasses) : '';
  return `pick ${turn.pick}, round ${turn.round}${suffix}`;
}

/**
 * Keeps the page title as `page` names it, starting "Your turn · " while it
 * says it is the viewer's turn, so a viewer can tell from their browser's
 * tabs; and puts the app's title back as the page goes. `page` is given the
 * app's title. Call it in a page's injection context.
 */
export function titleWithTurn(page: (appTitle: string) => { name: string; yourTurn: boolean }) {
  const title = inject(Title);
  const appTitle = title.getTitle();
  inject(DestroyRef).onDestroy(() => title.setTitle(appTitle));
  effect(() => {
    const { name, yourTurn } = page(appTitle);
    title.setTitle(yourTurn ? `Your turn · ${name}` : name);
  });
}
