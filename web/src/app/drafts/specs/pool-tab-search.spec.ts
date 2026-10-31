import { TestBed } from '@angular/core/testing';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  open,
  bob,
  alicePlayer,
  openDraft,
  flushPool,
} from './harness';
import { useTallScreen, complete, card, shivan, brightclimb, tiles } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  describe('search and hide picked', () => {
    const names = (page: HTMLElement) =>
      tiles(page).map((tile) => tile.querySelector('.placeholder')?.textContent);

    /** Types `text` into the Pool tab's search box, as a keystroke would. */
    async function search(
      fixture: { whenStable(): Promise<unknown> },
      page: HTMLElement,
      text: string,
    ) {
      const box = page.querySelector<HTMLInputElement>('input[type="search"]')!;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    it('says so while the pool’s cards load', async () => {
      const { fixture, page } = await open('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: complete }));
      await vi.waitFor(() => {
        TestBed.tick();
        expect(page.textContent).toContain('Loading the pool’s cards…');
      });

      await flushPool([shivan]);
      await fixture.whenStable();
      expect(page.textContent).not.toContain('Loading the pool’s cards…');
    });

    it('says so when no card matches the search', async () => {
      const { fixture, page } = await openDraft(complete, {}, { cards: [shivan] });
      expect(page.textContent).not.toContain('No cards match');

      await search(fixture, page, 't:goblin');

      expect(page.textContent).toContain('No cards match your search.');
    });

    it('says so when every card matching has been picked and is hidden', async () => {
      const { fixture, page } = await openDraft(
        complete,
        {
          state: 'Drafting',
          players: [alicePlayer],
          turn: { pick: 2, round: 1, playerId: alice.id },
        },
        {
          cards: [shivan],
          picks: [
            {
              pick: 1,
              playerId: alice.id,
              oracleId: shivan.oracleId,
              name: shivan.name,
              layout: 'normal',
              set: 'm20',
              collectorNumber: '332',
            },
          ],
        },
      );

      page.querySelector<HTMLInputElement>('.hide-picked input')!.click();
      await fixture.whenStable();

      expect(page.textContent).toContain('Every card here has been picked.');
    });

    it('narrows the grid to the cards matching the search as you type', async () => {
      const { fixture, page } = await openDraft(complete, {}, { cards: [brightclimb, shivan] });

      await search(fixture, page, 't:dragon');
      expect(names(page)).toEqual(['Shivan Dragon']);

      await search(fixture, page, 't:land');
      expect(names(page)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
    });

    it('says why a search is bad, and keeps the grid as it was until it is fixed', async () => {
      const { fixture, page } = await openDraft(complete, {}, { cards: [brightclimb, shivan] });
      const note = () => page.querySelector('[role="tabpanel"] .search-error')?.textContent;

      await search(fixture, page, 't:dragon');
      await search(fixture, page, 't:dragon (');
      expect(note()).toContain('The search ends too soon.');
      expect(names(page)).toEqual(['Shivan Dragon']);

      await search(fixture, page, 't:dragon usd<1');
      expect(note()).toContain('usd< isn’t supported here.');
      expect(names(page)).toEqual(['Shivan Dragon']);

      await search(fixture, page, 't:land');
      expect(note()).toBe('');
      expect(names(page)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
    });

    it('shows the whole pool when the search is emptied', async () => {
      const { fixture, page } = await openDraft(complete, {}, { cards: [brightclimb, shivan] });

      await search(fixture, page, 't:dragon');
      await search(fixture, page, '  ');

      expect(names(page)).toEqual(['Brightclimb Pathway // Grimclimb Pathway', 'Shivan Dragon']);
    });

    it('hides picked cards when asked, together with the search', async () => {
      const thundermaw = card({
        scryfallId: 'thundermaw-id',
        oracleId: 'thundermaw-oracle',
        name: 'Thundermaw Hellkite',
      });
      const { fixture, page } = await openDraft(
        complete,
        { state: 'Drafting', players: [bob], turn: { pick: 2, round: 1, playerId: bob.id } },
        {
          cards: [brightclimb, shivan, thundermaw],
          picks: [
            {
              pick: 1,
              playerId: bob.id,
              oracleId: 'shivan-oracle',
              name: 'Shivan Dragon',
              layout: 'normal',
              set: 'ima',
              collectorNumber: '1',
            },
          ],
        },
      );
      const hidePicked = page.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      expect(hidePicked.closest('label')?.textContent).toContain('Hide picked');

      await search(fixture, page, 't:dragon');
      expect(names(page)).toEqual(['Shivan Dragon', 'Thundermaw Hellkite']);
      expect(tiles(page)[0].textContent).toContain('Picked');

      hidePicked.click();
      await fixture.whenStable();
      expect(names(page)).toEqual(['Thundermaw Hellkite']);

      await search(fixture, page, '');
      expect(names(page)).toEqual([
        'Brightclimb Pathway // Grimclimb Pathway',
        'Thundermaw Hellkite',
      ]);

      hidePicked.click();
      await fixture.whenStable();
      expect(names(page)).toHaveLength(3);
    });
  });
});
