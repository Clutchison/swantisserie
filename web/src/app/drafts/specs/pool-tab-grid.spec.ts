import { TestBed } from '@angular/core/testing';
import { type PoolCardView } from '../drafts';
import { useDraftsApp, openDraft, completeSnapshot } from './harness';
import { useTallScreen, image, card, shivan, brightclimb, tiles } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  it('has a tab bar where Pool and Board work, and Me for players', async () => {
    const { page } = await openDraft(completeSnapshot);

    const tabs = [...page.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Pool', 'Queue', 'Board', 'Me']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(tabs.map((tab) => tab.disabled)).toEqual([false, true, false, true]);
    expect(page.querySelector('[role="tabpanel"]')?.textContent).toContain('540 cards in the pool');
  });

  it('puts the tab bar between the draft header and the panel, showing one panel at a time', async () => {
    const { page } = await openDraft(completeSnapshot);

    const tabBar = page.querySelector('[role="tablist"]')!;
    const panels = page.querySelectorAll('[role="tabpanel"]');
    expect(tabBar.previousElementSibling?.classList).toContain('players');
    expect(tabBar.nextElementSibling).toBe(panels[0]);
    expect([...panels].filter((panel) => !panel.hasAttribute('hidden'))).toHaveLength(1);
  });

  it('shows the pool as a grid of normal images with name placeholders', async () => {
    const { page } = await openDraft(completeSnapshot, {}, { cards: [brightclimb, shivan] });

    expect(tiles(page).map((tile) => tile.querySelector('.placeholder')?.textContent)).toEqual([
      'Brightclimb Pathway // Grimclimb Pathway',
      'Shivan Dragon',
    ]);
    const images = tiles(page).map((tile) => tile.querySelector('img')!);
    expect(images.map((img) => img.getAttribute('src'))).toEqual([
      image('normal', 'brightclimb-id'),
      image('normal', 'shivan-id'),
    ]);
    expect(images[1].getAttribute('alt')).toBe('Shivan Dragon');
  });

  it('falls back to Scryfall’s API image when a grid image fails to load', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [shivan] });

    const img = tiles(page)[0].querySelector('img')!;
    img.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(img.getAttribute('src')).toBe(
      'https://api.scryfall.com/cards/shivan-id?format=image&version=normal',
    );
    expect(img.hasAttribute('srcset')).toBe(false);
  });

  it('offers a tile’s small and normal images for the browser to choose between', async () => {
    const { page } = await openDraft(completeSnapshot, {}, { cards: [shivan] });

    const img = tiles(page)[0].querySelector('img')!;
    expect(img.getAttribute('srcset')).toBe(
      `${image('small', 'shivan-id')} 160w, ${image('normal', 'shivan-id')} 488w`,
    );
  });

  it('tells the browser how wide a tile is, once the grid is measured', async () => {
    onTestFinished(() => void vi.unstubAllGlobals());
    let measured!: ResizeObserverCallback;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          measured = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [shivan] });

    // Nine columns of 149px, with eight 8px gaps.
    measured([{ contentRect: { width: 1405 } } as ResizeObserverEntry], {} as ResizeObserver);
    await fixture.whenStable();

    expect(tiles(page)[0].querySelector('img')!.getAttribute('sizes')).toBe('149px');
  });

  describe('when a tile requests its image', () => {
    /** Stands in for the browser saying which tiles are on screen. */
    let screenChanged: IntersectionObserverCallback;
    class FakeIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        screenChanged = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    function report(tile: Element, isIntersecting: boolean) {
      screenChanged(
        [{ target: tile, isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }

    /** Lets `ms` pass, then renders what came of it. */
    function wait(ms: number) {
      vi.advanceTimersByTime(ms);
      TestBed.tick();
    }

    /** Opens the Pool tab, then takes over the clock. */
    async function openPool(cards: PoolCardView[]) {
      const opened = await openDraft(completeSnapshot, {}, { cards });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      return opened;
    }

    const src = (tile: Element) => tile.querySelector('img')?.getAttribute('src');

    beforeEach(() => vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver));
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('shows only the name until a tile on screen has settled, then requests its image', async () => {
      const { page } = await openPool([shivan]);
      const [tile] = tiles(page);

      report(tile, true);
      wait(99);
      expect(src(tile)).toBeUndefined();
      expect(tile.querySelector('.placeholder')?.textContent).toBe('Shivan Dragon');

      wait(51);
      expect(src(tile)).toBe(image('normal', 'shivan-id'));
    });

    it('never requests the image of a tile that leaves the screen before settling', async () => {
      const { page } = await openPool([brightclimb, shivan]);
      const [left, stayed] = tiles(page);

      report(left, true);
      report(stayed, true);
      wait(50);
      report(left, false);
      wait(100);

      expect(src(left)).toBeUndefined();
      expect(src(stayed)).toBe(image('normal', 'shivan-id'));
    });

    const third = card({ scryfallId: 'third-id', oracleId: 'third-oracle', name: 'Third' });

    it('requests the images of buffer rows only after the tiles on screen', async () => {
      const { page } = await openPool([brightclimb, shivan]);
      const [onScreen, buffer] = tiles(page);

      report(onScreen, true);
      report(buffer, false);
      wait(120);
      expect(src(onScreen)).toBeDefined();
      expect(src(buffer)).toBeUndefined();

      wait(100);
      expect(src(buffer)).toBe(image('normal', 'shivan-id'));
    });

    it('holds buffer rows back until it knows where every tile is, as on page load', async () => {
      const { page } = await openPool([brightclimb, shivan]);
      const [buffer, onScreen] = tiles(page);

      report(buffer, false);
      wait(500);
      expect(src(buffer)).toBeUndefined();

      report(onScreen, true);
      wait(120);
      expect(src(onScreen)).toBeDefined();
      expect(src(buffer)).toBeUndefined();

      wait(100);
      expect(src(buffer)).toBeDefined();
    });

    it('holds buffer rows back again when a scroll brings another tile on screen', async () => {
      const { page } = await openPool([brightclimb, shivan, third]);
      const [first, next, buffer] = tiles(page);

      report(first, true);
      report(next, false);
      report(buffer, false);
      wait(130);
      report(next, true);
      wait(60);
      expect(src(buffer)).toBeUndefined();

      wait(60);
      expect(src(next)).toBeDefined();
      expect(src(buffer)).toBeUndefined();

      wait(100);
      expect(src(buffer)).toBeDefined();
    });

    it('requests nothing off screen while the Pool tab is hidden', async () => {
      const { page } = await openPool([brightclimb, shivan]);
      const [first, second] = tiles(page);
      const panel = first.closest<HTMLElement>('[role="tabpanel"]')!;

      panel.hidden = true;
      report(first, false);
      report(second, false);
      wait(500);
      expect(src(first)).toBeUndefined();
      expect(src(second)).toBeUndefined();

      panel.hidden = false;
      report(first, true);
      wait(220);
      expect(src(first)).toBeDefined();
      expect(src(second)).toBeDefined();
    });

    it('shows a card whose image was already requested straight away in a new tile', async () => {
      const { page } = await openPool([brightclimb, shivan]);
      tiles(page).forEach((tile) => report(tile, true));
      wait(150);

      // Moves the card up a row, which gives it a new tile.
      const search = page.querySelector<HTMLInputElement>('input[type="search"]')!;
      search.value = 'shivan';
      search.dispatchEvent(new Event('input'));
      TestBed.tick();

      expect(tiles(page)).toHaveLength(1);
      expect(src(tiles(page)[0])).toBe(image('normal', 'shivan-id'));
    });

    it('leaves a tile whose row was set aside waiting, on screen or in the buffer', async () => {
      const { page } = await openPool([brightclimb, shivan, third]);
      const [settling, buffer, onScreen] = tiles(page);

      report(settling, true);
      report(buffer, false);
      report(onScreen, true);
      settling.remove();
      buffer.remove();
      wait(300);

      expect(src(onScreen)).toBeDefined();
      expect(src(settling)).toBeUndefined();
      expect(src(buffer)).toBeUndefined();
    });

    it('falls back to Scryfall’s API image when a settled tile’s image fails', async () => {
      const { page } = await openPool([shivan]);
      const [tile] = tiles(page);

      report(tile, true);
      wait(150);
      tile.querySelector('img')!.dispatchEvent(new Event('error'));
      TestBed.tick();

      expect(src(tile)).toBe(
        'https://api.scryfall.com/cards/shivan-id?format=image&version=normal',
      );
    });
  });
});
