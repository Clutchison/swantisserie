import { TestBed } from '@angular/core/testing';
import { type PickView, type PoolCardView } from '../drafts';
import {
  bob,
  completeSnapshot,
  draft,
  flushPicks,
  http,
  openUrl,
  tabButton,
  useDraftsApp,
  wait,
} from './harness';
import {
  brightclimb,
  card,
  image,
  openDetail,
  shivan,
  tiles,
  useTallScreen,
} from './pool-tab-harness';

useDraftsApp();
useTallScreen();

/** Stands in for the browser's off-page images, keeping those asked for. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(url: string) {
    requests.push({ url, image: this });
  }
}
let requests: { url: string; image: FakeImage }[];
const requested = () => requests.map((request) => request.url);

/** Opens the Pool tab on `cards`, with the clock taken over before any of them arrive. */
async function openPool(cards: PoolCardView[], picks?: PickView[]) {
  const { fixture, page } = await openUrl('/drafts/draft-1');
  http.expectOne('/api/drafts/draft-1').flush(
    draft({
      snapshot: completeSnapshot,
      ...(picks && {
        state: 'Drafting',
        players: [bob],
        turn: { pick: picks.length + 1, round: 1, playerId: bob.id },
      }),
    }),
  );
  if (picks) await flushPicks(picks);
  await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool').flush(cards));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await fixture.whenStable();
  TestBed.tick();
  return { fixture, page };
}

beforeEach(() => {
  requests = [];
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('preloading a single card', () => {
  const large = image('large', 'shivan-id');

  it('starts once the mouse has rested on a tile for 150ms', async () => {
    const { page } = await openPool([shivan]);

    tiles(page)[0].dispatchEvent(new MouseEvent('mouseenter'));
    wait(149);
    expect(requested()).toEqual([]);

    wait(1);
    expect(requested()).toEqual([large]);
  });

  it('starts nothing when the mouse crosses a tile quickly', async () => {
    const { page } = await openPool([shivan]);

    tiles(page)[0].dispatchEvent(new MouseEvent('mouseenter'));
    wait(100);
    tiles(page)[0].dispatchEvent(new MouseEvent('mouseleave'));
    wait(100);

    expect(requested()).toEqual([]);
  });

  it.each(['touchstart', 'focus'])('starts at once on %s', async (event) => {
    const { page } = await openPool([shivan]);

    tiles(page)[0].dispatchEvent(new Event(event));

    expect(requested()).toEqual([large]);
  });

  it('loads a double-faced card’s back face when its Card detail opens', async () => {
    const { fixture, page } = await openPool([brightclimb]);

    await openDetail(fixture, page, 0);

    expect(requested()).toEqual([image('large', 'brightclimb-id', 'back')]);
  });

  it('requests an image only once, however often a viewer shows interest', async () => {
    const { page } = await openPool([shivan]);
    const [tile] = tiles(page);

    tile.dispatchEvent(new Event('focus'));
    tile.dispatchEvent(new Event('touchstart'));
    tile.dispatchEvent(new MouseEvent('mouseenter'));
    wait(150);

    expect(requested()).toEqual([large]);
  });

  it('stays silent when a preload fails, leaving the Card detail its normal image', async () => {
    const { fixture, page } = await openPool([shivan]);

    tiles(page)[0].dispatchEvent(new Event('focus'));
    requests[0].image.onerror?.();
    const detail = await openDetail(fixture, page, 0);

    expect(detail.querySelector('.large img:not(.placeholder)')?.getAttribute('src')).toBe(large);
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('preloading the first results', () => {
  /** `count` cards a pool search can tell apart by name, numbered from 1. */
  const numbered = (count: number, prefix = 'dragon') =>
    Array.from({ length: count }, (_, i) => {
      const id = `${prefix}-${i + 1}`;
      return card({
        scryfallId: id,
        oracleId: `${id}-oracle`,
        name: id,
        images: [
          {
            small: image('small', id),
            normal: image('normal', id),
            large: image('large', id),
          },
        ],
      });
    });
  const large = (...ids: string[]) => ids.map((id) => image('large', id));
  const dragons = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `dragon-${from + i}`);

  const picked = ({ oracleId, name }: PoolCardView): PickView => ({
    pick: 1,
    playerId: bob.id,
    oracleId,
    name,
    layout: 'normal',
    set: 'm20',
    collectorNumber: '1',
  });

  /** Types `text` into the Pool tab's search box, as a keystroke would. */
  function search(page: HTMLElement, text: string) {
    const box = page.querySelector<HTMLInputElement>('input[type="search"]')!;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    TestBed.tick();
  }

  /** Finishes every image running. */
  function finishRunning() {
    for (const { image: running } of requests.splice(0)) running.onload?.();
  }

  /** Finishes images until none are left, returning every URL requested on the way. */
  function drainRequests() {
    const seen: string[] = [];
    while (requests.length > 0) {
      seen.push(...requested());
      finishRunning();
    }
    return seen;
  }

  const lands = () => numbered(1, 'land').map((land) => ({ ...land, typeLine: 'Land' }));

  it('starts 500ms after the Pool tab first shows, with an empty search', async () => {
    await openPool(numbered(1));

    wait(499);
    expect(requested()).toEqual([]);

    wait(1);
    expect(requested()).toEqual(large('dragon-1'));
  });

  it('loads at most 4 at a time, the next starting as one finishes or fails', async () => {
    await openPool(numbered(6));

    wait(500);
    expect(requested()).toEqual(large(...dragons(1, 4)));

    requests[0].image.onload?.();
    expect(requested()).toEqual(large(...dragons(1, 5)));

    requests[1].image.onerror?.();
    expect(requested()).toEqual(large(...dragons(1, 6)));
  });

  it('stops at the first 20 cards', async () => {
    await openPool(numbered(25));

    wait(500);
    expect(drainRequests()).toEqual(large(...dragons(1, 20)));
  });

  it('counts only the unpicked cards among the first 20, even with picked cards shown', async () => {
    const cards = numbered(22);

    await openPool(cards, [picked(cards[0])]);
    wait(500);
    expect(drainRequests()).toEqual(large(...dragons(2, 21)));
  });

  it('leaves picked cards out when they’re hidden too', async () => {
    const cards = numbered(2);
    const { page } = await openPool(cards, [picked(cards[0])]);

    page.querySelector<HTMLInputElement>('.hide-picked input')!.click();
    TestBed.tick();
    wait(500);

    expect(requested()).toEqual(large('dragon-2'));
  });

  it('keeps waiting undisturbed when something changes but the results don’t', async () => {
    const { page } = await openPool(numbered(1));

    wait(300);
    tiles(page)[0].querySelector('img')!.dispatchEvent(new Event('error'));
    TestBed.tick();
    wait(200);

    expect(requested()).toEqual(large('dragon-1'));
  });

  it('takes the next card in place of one whose large image is known to be broken', async () => {
    const { fixture, page } = await openPool(numbered(21));

    const detail = await openDetail(fixture, page, 0);
    detail.querySelector('.large img:not(.placeholder)')!.dispatchEvent(new Event('error'));
    TestBed.tick();
    wait(500);

    expect(drainRequests()).toEqual(large(...dragons(2, 21)));
  });

  it('preloads the results of the search once it has been unchanged for 500ms', async () => {
    const { page } = await openPool([...numbered(1), ...lands()]);

    search(page, 't:lan');
    wait(400);
    search(page, 't:land');
    wait(499);
    expect(requested()).toEqual([]);

    wait(1);
    expect(requested()).toEqual(large('land-1'));
  });

  it('drops images not yet requested when the results change, and lets those running finish', async () => {
    const { page } = await openPool([...numbered(6), ...lands()]);
    wait(500);
    expect(requested()).toEqual(large(...dragons(1, 4)));
    const running = requests.map((request) => request.image);

    search(page, 't:land');
    running.forEach((image) => image.onload?.());
    expect(requested()).toEqual(large(...dragons(1, 4)));

    wait(500);
    expect(requested()).toEqual([...large(...dragons(1, 4)), ...large('land-1')]);
  });

  it('requests each image once across edited searches', async () => {
    const { page } = await openPool(numbered(2));
    wait(500);

    search(page, 'dragon-1');
    wait(500);
    search(page, '');
    wait(500);

    expect(requested()).toEqual(large('dragon-1', 'dragon-2'));
  });

  it('never preloads what a viewer has already opened in the Card detail', async () => {
    const { fixture, page } = await openPool(numbered(1));

    await openDetail(fixture, page, 0);
    wait(500);

    expect(requested()).toEqual([]);
  });

  it('waits for the Pool tab to be the visible one', async () => {
    const { page } = await openPool(numbered(1));

    tabButton(page, 'Board').click();
    TestBed.tick();
    wait(1000);
    expect(requested()).toEqual([]);

    tabButton(page, 'Pool').click();
    TestBed.tick();
    wait(500);
    expect(requested()).toEqual(large('dragon-1'));
  });

  describe('with the browser saying which tiles are on screen', () => {
    let screenChanged: IntersectionObserverCallback;
    class FakeIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        screenChanged = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    beforeEach(() => vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver));

    it('waits for the tiles on screen to have requested their own images', async () => {
      const { page } = await openPool(numbered(1));
      const [tile] = tiles(page);

      wait(1000);
      expect(requested()).toEqual([]);

      screenChanged(
        [{ target: tile, isIntersecting: true } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      wait(119);
      expect(tile.querySelector('img')).toBeNull();
      wait(1);
      expect(tile.querySelector('img')).not.toBeNull();
      wait(499);
      expect(requested()).toEqual([]);

      wait(1);
      expect(requested()).toEqual(large('dragon-1'));
    });
  });

  describe('on a constrained connection', () => {
    const connected = (connection: object) =>
      Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
    afterEach(() => delete (navigator as { connection?: object }).connection);

    it.each([
      ['data saver', { saveData: true, effectiveType: '4g' }],
      ['2G', { saveData: false, effectiveType: '2g' }],
      ['slow 2G', { saveData: false, effectiveType: 'slow-2g' }],
    ])('skips the first results on %s, but not a single card', async (_, connection) => {
      connected(connection);
      const { page } = await openPool(numbered(1));

      wait(500);
      expect(requested()).toEqual([]);

      tiles(page)[0].dispatchEvent(new Event('focus'));
      expect(requested()).toEqual(large('dragon-1'));
    });

    it('runs on a good connection', async () => {
      connected({ saveData: false, effectiveType: '4g' });
      await openPool(numbered(1));

      wait(500);

      expect(requested()).toEqual(large('dragon-1'));
    });
  });
});
