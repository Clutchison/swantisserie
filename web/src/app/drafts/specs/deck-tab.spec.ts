import {
  useDraftsApp,
  bob,
  panel,
  openDraft,
  completeSnapshot,
  drafting,
  openTab,
} from './harness';
import { useTallScreen } from './pool-tab-harness';
import { cards, planOf, planBoards } from './plan-tab-harness';

useDraftsApp();
useTallScreen();

describe('deck tab', () => {
  const tabs = (page: HTMLElement) =>
    [...page.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim());
  const complete = drafting({ state: 'Complete', turn: null });

  it('takes the Plan tab’s place once the draft is complete, its copy saying deck', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, complete, {
      cards,
      plan: planOf({ basics: [{ land: 'Mountain', count: 2 }] }),
    });

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Deck', 'Board', 'Export']);
    const deck = await openTab(fixture, page, 'Deck');
    expect(deck.querySelector('h2')?.textContent).toBe('Deck');
    expect(deck.textContent).toContain('Only you can see your deck.');
    expect(deck.textContent).not.toMatch(/\bplan\b/i);
    expect(planBoards(deck)[0].heading).toBe('Mainboard 6 (6 picked)');
  });

  it('tells a viewer who isn’t a player that only players have a deck', async () => {
    const { page } = await openDraft(completeSnapshot, { ...complete, players: [bob] });

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Deck', 'Board', 'Export']);
    expect(page.querySelector('#plan-panel')?.textContent).toContain('Only players have a deck.');
  });

  it.each([
    ['still drafting', drafting({ turn: { pick: 3, round: 2, playerId: bob.id } })],
    ['closed', drafting({ state: 'Closed', turn: null })],
  ])('stays the Plan tab while the draft is %s', async (_, fields) => {
    const { fixture, page } = await openDraft(completeSnapshot, fields, {
      cards,
      plan: planOf(),
    });

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Plan', 'Board', 'Export']);
    const plan = await openTab(fixture, page, 'Plan');
    expect(plan.querySelector('h2')?.textContent).toBe('Plan');
    expect(panel(page).textContent).toContain('Only you can see your plan.');
  });
});
