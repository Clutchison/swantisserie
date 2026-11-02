import type { DraftView } from '../drafts';
import { useDraftsApp, bob, openDraft, completeSnapshot } from './harness';

useDraftsApp();

describe('seat order', () => {
  const seats = (page: HTMLElement) => page.querySelector<HTMLDetailsElement>('.players details')!;

  const toggle = (page: HTMLElement) => seats(page).querySelector('summary')!.click();

  const drafting = (): Partial<DraftView> => ({
    state: 'Drafting',
    players: [bob],
    turn: { pick: 1, round: 1, playerId: bob.id },
  });

  function onDesktop(desktop: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: desktop && query === '(min-width: 1024px)',
    }));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('on desktop', () => {
    beforeEach(() => onDesktop(true));

    it('is open in the lobby, where seats are arranged', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      expect(seats(page).open).toBe(true);
    });

    it('stays open once the draft has started, showing every seat', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(seats(page).open).toBe(true);
      expect(page.querySelector('.turn')?.textContent).toContain('Bob’s turn');
    });

    it('can be collapsed and expanded by hand', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      toggle(page);
      expect(seats(page).open).toBe(false);
      toggle(page);
      expect(seats(page).open).toBe(true);
    });
  });

  describe('on mobile', () => {
    beforeEach(() => onDesktop(false));

    it('is open in the lobby, where seats are arranged', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      expect(seats(page).open).toBe(true);
    });

    it('collapses once the draft has started, out of the way of the panels', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(seats(page).open).toBe(false);
      expect(page.querySelector('.turn')?.textContent).toContain('Bob’s turn');
    });

    it('can be expanded and collapsed by hand', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      toggle(page);
      expect(seats(page).open).toBe(true);
      toggle(page);
      expect(seats(page).open).toBe(false);
    });
  });
});
