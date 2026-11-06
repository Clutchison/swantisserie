import {
  useDraftsApp,
  alice,
  bob,
  buttons,
  panel,
  openDraft,
  completeSnapshot,
  drafting,
  openTab,
} from './harness';
import { useTallScreen } from './pool-tab-harness';
import { cards, planOf, planBoards } from './plan-tab-harness';
import { registration, withTournament } from './tournament-tab-harness';

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

  describe('while the deck is locked', () => {
    /** The buttons in the Deck tab that would change the deck. */
    const deckEdits = (deck: HTMLElement) =>
      [...deck.querySelectorAll('button')].filter((b) =>
        /^(Move|Remove|Basic lands)/.test(
          b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '',
        ),
      );
    const deck = planOf({ basics: [{ land: 'Mountain', count: 2 }] });

    it('says the deck is locked and offers no edits once its player has joined the tournament', async () => {
      const tournament = registration(bob.id, alice.id);
      const { fixture, page } = await openDraft(completeSnapshot, withTournament(tournament), {
        cards,
        plan: deck,
        tournament,
      });

      const tab = await openTab(fixture, page, 'Deck');

      expect(tab.textContent).toContain(
        'Your deck is locked while you’re in this draft’s tournament.',
      );
      expect(deckEdits(tab)).toEqual([]);
      expect(planBoards(tab)[0].heading).toBe('Mainboard 6 (6 picked)');
      expect(buttons(page, 'Export')[0].disabled).toBe(false);
    });

    it('offers edits while the player hasn’t joined', async () => {
      const tournament = registration(bob.id);
      const { fixture, page } = await openDraft(completeSnapshot, withTournament(tournament), {
        cards,
        plan: deck,
        tournament,
      });

      const tab = await openTab(fixture, page, 'Deck');

      expect(tab.textContent).not.toContain('locked');
      expect(deckEdits(tab).length).toBeGreaterThan(0);
    });
  });
});
