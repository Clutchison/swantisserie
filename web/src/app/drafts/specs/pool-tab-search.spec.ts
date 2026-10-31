import { TestBed } from '@angular/core/testing';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  openUrl,
  bob,
  alicePlayer,
  openDraft,
  flushPool,
  completeSnapshot,
  type AppFixture,
} from './harness';
import { useTallScreen, card, shivan, brightclimb, tiles } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  describe('search and hide picked', () => {
    const names = (page: HTMLElement) =>
      tiles(page).map((tile) => tile.querySelector('.placeholder')?.textContent);

    /** Types `text` into the Pool tab's search box, as a keystroke would. */
    async function search(fixture: AppFixture, page: HTMLElement, text: string) {
      const box = page.querySelector<HTMLInputElement>('input[type="search"]')!;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    it('labels the search box "Scryfall Search", keeping its example placeholder', async () => {
      const { page } = await openDraft(completeSnapshot, {}, { cards: [shivan] });
      const box = page.querySelector<HTMLInputElement>('input[type="search"]')!;

      expect(box.labels?.[0]?.textContent?.trim()).toBe('Scryfall Search');
      expect(box.hasAttribute('aria-label')).toBe(false);
      expect(box.placeholder).toBe('Search, e.g. t:dragon c:r');
    });

    it('says so while the pool’s cards load', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      await vi.waitFor(() => {
        TestBed.tick();
        expect(page.textContent).toContain('Loading the pool’s cards…');
      });

      await flushPool([shivan]);
      await fixture.whenStable();
      expect(page.textContent).not.toContain('Loading the pool’s cards…');
    });

    it('says so when no card matches the search', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [shivan] });
      expect(page.textContent).not.toContain('No cards match');

      await search(fixture, page, 't:goblin');

      expect(page.textContent).toContain('No cards match your search.');
    });

    it('says so when every card matching has been picked and is hidden', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
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
      const { fixture, page } = await openDraft(
        completeSnapshot,
        {},
        { cards: [brightclimb, shivan] },
      );

      await search(fixture, page, 't:dragon');
      expect(names(page)).toEqual(['Shivan Dragon']);

      await search(fixture, page, 't:land');
      expect(names(page)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
    });

    it('says why a search is bad, and keeps the grid as it was until it is fixed', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        {},
        { cards: [brightclimb, shivan] },
      );
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
      const { fixture, page } = await openDraft(
        completeSnapshot,
        {},
        { cards: [brightclimb, shivan] },
      );

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
        completeSnapshot,
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

    describe('color filter', () => {
      const colored = (name: string, colors: string[], typeLine = 'Creature — Bear') =>
        card({ scryfallId: name, oracleId: name, name, colors, typeLine });
      const white = colored('White Bear', ['W']);
      const blue = colored('Blue Bear', ['U']);
      const azorius = colored('Azorius Bear', ['W', 'U']);
      const orzhov = colored('Orzhov Bear', ['W', 'B']);
      const golem = colored('Colorless Golem', [], 'Artifact Creature — Golem');
      const pool = [white, blue, azorius, orzhov, golem];

      const button = (page: HTMLElement, name: string) =>
        page.querySelector<HTMLButtonElement>(`.color-filter button[aria-label="${name}"]`)!;

      async function press(fixture: AppFixture, page: HTMLElement, ...buttons: string[]) {
        for (const name of buttons) button(page, name).click();
        await fixture.whenStable();
      }

      it('offers six named toggle buttons with stored mana symbols, none pressed', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: pool });
        const buttons = [...page.querySelectorAll('.color-filter button')];

        expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
          'White',
          'Blue',
          'Black',
          'Red',
          'Green',
          'Colorless',
        ]);
        expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(Array(6).fill('false'));
        expect(button(page, 'White').querySelector('img')?.getAttribute('src')).toBe('mana/W.svg');

        await press(fixture, page, 'White');
        expect(button(page, 'White').getAttribute('aria-pressed')).toBe('true');

        await press(fixture, page, 'White');
        expect(button(page, 'White').getAttribute('aria-pressed')).toBe('false');
        expect(names(page)).toHaveLength(5);
      });

      it('shows cards whose colors are all among those pressed', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: pool });

        await press(fixture, page, 'White', 'Blue');
        expect(names(page)).toEqual(['White Bear', 'Blue Bear', 'Azorius Bear']);

        await press(fixture, page, 'Colorless');
        expect(names(page)).toEqual(['White Bear', 'Blue Bear', 'Azorius Bear', 'Colorless Golem']);

        await press(fixture, page, 'White', 'Blue');
        expect(names(page)).toEqual(['Colorless Golem']);
      });

      it('combines with a typed search and with Hide picked, leaving the search box alone', async () => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          { state: 'Drafting', players: [bob], turn: { pick: 2, round: 1, playerId: bob.id } },
          {
            cards: pool,
            picks: [
              {
                pick: 1,
                playerId: bob.id,
                oracleId: white.oracleId,
                name: white.name,
                layout: 'normal',
                set: 'm20',
                collectorNumber: '332',
              },
            ],
          },
        );

        await search(fixture, page, 'bear');
        await press(fixture, page, 'White', 'Colorless');
        expect(names(page)).toEqual(['White Bear']);
        expect(page.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('bear');

        page.querySelector<HTMLInputElement>('.hide-picked input')!.click();
        await fixture.whenStable();
        expect(page.textContent).toContain('Every card here has been picked.');
      });

      it('still responds while the search cannot be parsed, over the last good results', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: pool });

        await search(fixture, page, 't:bear');
        await search(fixture, page, 't:bear (');
        expect(page.textContent).toContain('The search ends too soon.');

        await press(fixture, page, 'Blue');
        expect(names(page)).toEqual(['Blue Bear']);
        expect(page.textContent).toContain('The search ends too soon.');
      });

      it('says the filters may be why nothing matches, only while one is active', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [white] });

        await press(fixture, page, 'Green');
        expect(page.textContent).toContain('No cards match your search and filters.');

        await press(fixture, page, 'Green');
        await search(fixture, page, 't:goblin');
        expect(page.textContent).toContain('No cards match your search.');
        expect(page.textContent).not.toContain('search and filters');

        await press(fixture, page, 'White');
        expect(page.textContent).toContain('No cards match your search and filters.');
      });

      it('lasts while the viewer switches tabs', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: pool });
        const tab = (name: string) =>
          [...page.querySelectorAll<HTMLElement>('[role="tab"]')].find(
            (t) => t.textContent?.trim() === name,
          )!;

        await press(fixture, page, 'Blue');
        tab('Board').click();
        await fixture.whenStable();
        tab('Pool').click();
        await fixture.whenStable();

        expect(button(page, 'Blue').getAttribute('aria-pressed')).toBe('true');
        expect(names(page)).toEqual(['Blue Bear']);
      });
    });
  });
});
