import { TestBed } from '@angular/core/testing';
import { type PickView, type PoolCardView, type PoolSnapshotView, type QueueView } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  open,
  bob,
  alicePlayer,
  tabButton,
  panel,
  openDraft,
  flushPicks,
} from './harness';

useDraftsApp();

describe('card previews', () => {
  const complete: PoolSnapshotView = { state: 'Complete', cards: 2, total: 2 };
  const normal = (id: string, face = 'front') =>
    `https://cards.scryfall.io/normal/${face}/${id}.jpg`;
  const poolCard = (id: string, name: string, faces = ['front']): PoolCardView => ({
    scryfallId: `${id}-id`,
    oracleId: `${id}-oracle`,
    name,
    set: 'ima',
    collectorNumber: '1',
    typeLine: 'Instant',
    colors: ['R'],
    manaValue: 1,
    manaCost: '{R}',
    oracleText: null,
    colorIdentity: ['R'],
    keywords: [],
    rarity: 'common',
    layout: 'normal',
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    faces: [],
    images: faces.map((face) => ({
      small: `https://cards.scryfall.io/small/${face}/${id}-id.jpg`,
      normal: normal(`${id}-id`, face),
      large: `https://cards.scryfall.io/large/${face}/${id}-id.jpg`,
    })),
  });
  const bolt = poolCard('bolt', 'Lightning Bolt');
  const shock = poolCard('shock', 'Shock');
  const pick = (number: number, card: PoolCardView, playerId = alice.id): PickView => ({
    pick: number,
    playerId,
    oracleId: card.oracleId,
    name: card.name,
    layout: card.layout,
    set: card.set,
    collectorNumber: card.collectorNumber,
  });

  /** Opens a draft with `picks` made and `options` as openDraft takes them. */
  async function openPicked(
    options: { cards?: PoolCardView[]; picks?: PickView[]; queue?: QueueView } = {},
  ) {
    return openDraft(
      complete,
      {
        state: 'Drafting',
        players: [alicePlayer, bob],
        turn: { pick: 3, round: 1, playerId: bob.id },
      },
      { cards: [bolt, shock], picks: [pick(1, bolt), pick(2, shock, bob.id)], ...options },
    );
  }

  /** Opens the Board tab of a draft with picks, then takes over the clock. */
  async function openBoard(options: Parameters<typeof openPicked>[0] = {}) {
    const opened = await openPicked(options);
    tabButton(opened.page, 'Board').click();
    await opened.fixture.whenStable();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    return opened;
  }

  afterEach(() => vi.useRealTimers());

  /** Lets `ms` pass, then renders what came of it. */
  function wait(ms: number) {
    vi.advanceTimersByTime(ms);
    TestBed.tick();
  }

  /** A card name in the Board's pick lists, by its text. */
  const boardName = (page: HTMLElement, name: string) =>
    [...page.querySelectorAll<HTMLElement>('.player-picks li span')].find(
      (span) => span.textContent?.trim() === name,
    )!;
  /** The Card preview's image, if one is open: it's outside the page. */
  const previewImage = () => document.querySelector<HTMLImageElement>('app-card-preview img');

  const pointer = (type: string, pointerType: string) =>
    new PointerEvent(type, { pointerType, bubbles: type === 'pointerdown' });
  function hover(name: HTMLElement) {
    name.dispatchEvent(pointer('pointerenter', 'mouse'));
  }
  function unhover(name: HTMLElement) {
    name.dispatchEvent(pointer('pointerleave', 'mouse'));
    TestBed.tick();
  }

  it('opens on the card’s normal front image after hovering a name for about 150ms', async () => {
    const { page } = await openBoard();

    hover(boardName(page, 'Lightning Bolt'));
    wait(149);
    expect(previewImage()).toBeNull();
    wait(1);

    expect(previewImage()?.getAttribute('src')).toBe(normal('bolt-id'));
    expect(previewImage()?.getAttribute('alt')).toBe('Lightning Bolt');
  });

  it('closes as soon as the mouse leaves the name', async () => {
    const { page } = await openBoard();
    const name = boardName(page, 'Lightning Bolt');

    hover(name);
    wait(150);
    unhover(name);

    expect(previewImage()).toBeNull();
  });

  it('opens nothing when the mouse crosses a list of names', async () => {
    const { page } = await openBoard();

    for (const text of ['Lightning Bolt', 'Shock']) {
      hover(boardName(page, text));
      wait(100);
      unhover(boardName(page, text));
    }
    wait(500);

    expect(previewImage()).toBeNull();
  });

  it('does nothing beyond hovering when a name is clicked with a mouse', async () => {
    const { page } = await openBoard();
    const name = boardName(page, 'Lightning Bolt');

    // Unhovered: the click alone opens nothing.
    name.dispatchEvent(pointer('pointerdown', 'mouse'));
    name.click();
    TestBed.tick();
    expect(previewImage()).toBeNull();

    // Hovered: the click neither hurries, stops nor closes the preview.
    hover(name);
    name.dispatchEvent(pointer('pointerdown', 'mouse'));
    name.click();
    TestBed.tick();
    expect(previewImage()).toBeNull();
    wait(150);
    name.dispatchEvent(pointer('pointerdown', 'mouse'));
    name.click();
    TestBed.tick();
    expect(previewImage()?.getAttribute('src')).toBe(normal('bolt-id'));
  });

  function tap(target: HTMLElement) {
    target.dispatchEvent(pointer('pointerenter', 'touch'));
    target.dispatchEvent(pointer('pointerdown', 'touch'));
    target.dispatchEvent(pointer('pointerleave', 'touch'));
    target.click();
    TestBed.tick();
  }

  it('opens at once on a tap, and stays open with a touch’s enter and leave', async () => {
    const { page } = await openBoard();

    tap(boardName(page, 'Lightning Bolt'));
    wait(1000);

    expect(previewImage()?.getAttribute('src')).toBe(normal('bolt-id'));
  });

  it('switches to the card of another name tapped', async () => {
    const { page } = await openBoard();

    tap(boardName(page, 'Lightning Bolt'));
    tap(boardName(page, 'Shock'));

    expect(document.querySelectorAll('app-card-preview')).toHaveLength(1);
    expect(previewImage()?.getAttribute('src')).toBe(normal('shock-id'));
  });

  it('closes on a tap elsewhere', async () => {
    const { page } = await openBoard();

    tap(boardName(page, 'Lightning Bolt'));
    tap(page.querySelector('h1')!);

    expect(previewImage()).toBeNull();
  });

  it('closes on scrolling', async () => {
    const { page } = await openBoard();

    tap(boardName(page, 'Lightning Bolt'));
    document.dispatchEvent(new Event('scroll'));
    TestBed.tick();

    expect(previewImage()).toBeNull();
  });

  it('takes each event’s pointer type, so one screen works with both', async () => {
    const { page } = await openBoard();

    tap(boardName(page, 'Lightning Bolt'));
    hover(boardName(page, 'Shock'));
    wait(150);
    expect(previewImage()?.getAttribute('src')).toBe(normal('shock-id'));

    unhover(boardName(page, 'Shock'));
    expect(previewImage()).toBeNull();
  });

  it('is view-only, with the front face only and the card’s shape reserved', async () => {
    const pathway = poolCard('pathway', 'Brightclimb Pathway', ['front', 'back']);
    const { page } = await openBoard({ cards: [pathway], picks: [pick(1, pathway)] });

    tap(boardName(page, 'Brightclimb Pathway'));

    const preview = document.querySelector('app-card-preview')!;
    expect(preview.querySelectorAll('button, a')).toHaveLength(0);
    expect(preview.querySelectorAll('img')).toHaveLength(1);
    expect(previewImage()?.getAttribute('src')).toBe(normal('pathway-id'));
    expect(previewImage()?.getAttribute('width')).toBe('488');
    expect(previewImage()?.getAttribute('height')).toBe('680');
  });

  it('requests no image until it opens', async () => {
    const { page } = await openBoard();

    expect(page.querySelector('#board-panel img')).toBeNull();
    expect(previewImage()).toBeNull();
  });

  it('falls back to Scryfall’s API image, as the Pool tab does', async () => {
    const { page } = await openBoard();

    tap(boardName(page, 'Lightning Bolt'));
    previewImage()!.dispatchEvent(new Event('error'));
    TestBed.tick();

    expect(previewImage()?.getAttribute('src')).toBe(
      'https://api.scryfall.com/cards/bolt-id?format=image&version=normal',
    );
  });

  it('fetches the pool once, for the Pool tab too', async () => {
    const { page } = await openBoard();

    tap(boardName(page, 'Lightning Bolt'));
    tabButton(page, 'Pool').click();
    TestBed.tick();

    // The afterEach's verify would catch a second request left unanswered.
    http.expectNone('/api/drafts/draft-1/pool');
    expect(page.querySelector('.grid .placeholder')).not.toBeNull();
  });

  it('leaves a name out of the pool as plain text', async () => {
    const { page } = await openBoard({ cards: [shock] });

    tap(boardName(page, 'Lightning Bolt'));
    hover(boardName(page, 'Lightning Bolt'));
    wait(150);

    expect(previewImage()).toBeNull();
  });

  it('leaves names as plain text while the pool is loading or failed to load', async () => {
    const { fixture, page } = await open('/drafts/draft-1');
    http
      .expectOne('/api/drafts/draft-1')
      .flush(draft({ snapshot: complete, state: 'Drafting', players: [bob] }));
    await flushPicks([pick(1, bolt, bob.id)]);
    const request = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool'));
    await vi.waitFor(() => {
      TestBed.tick();
      expect(boardName(page, 'Lightning Bolt')).toBeDefined();
    });
    tabButton(page, 'Board').click();
    TestBed.tick();

    tap(boardName(page, 'Lightning Bolt'));
    expect(previewImage()).toBeNull();

    request.flush('', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    tap(boardName(page, 'Lightning Bolt'));
    expect(previewImage()).toBeNull();
    expect(panel(page).querySelector('.error')).toBeNull();
  });

  it('shows on names in the pick log and on another player’s picks', async () => {
    const { fixture, page } = await openBoard();

    tap(panel(page).querySelector<HTMLElement>('.log .card span')!);
    expect(previewImage()?.getAttribute('src')).toBe(normal('bolt-id'));

    panel(page).querySelector<HTMLButtonElement>('.player-picks button')!.click();
    TestBed.tick();
    vi.useRealTimers();
    await fixture.whenStable();
    tap(page.querySelector('h1')!);
    tap(panel(page).querySelector<HTMLElement>('.picks .card span')!);
    expect(previewImage()?.getAttribute('src')).toBe(normal('bolt-id'));
  });

  describe('in the queue', () => {
    const queue: QueueView = {
      cards: [{ oracleId: shock.oracleId, name: shock.name }],
      lost: [{ oracleId: bolt.oracleId, name: bolt.name }],
    };

    async function openQueue() {
      const opened = await openPicked({ queue });
      tabButton(opened.page, 'Queue').click();
      await opened.fixture.whenStable();
      return opened;
    }

    it('shows on queue rows and the queue lost notice', async () => {
      const { page } = await openQueue();

      tap(panel(page).querySelector<HTMLElement>('li .name span')!);
      expect(previewImage()?.getAttribute('src')).toBe(normal('shock-id'));

      tap(panel(page).querySelector<HTMLElement>('.lost strong')!);
      expect(previewImage()?.getAttribute('src')).toBe(normal('bolt-id'));
    });

    it('closes when a drag starts, and opens none until it is released', async () => {
      const { page } = await openQueue();
      const name = panel(page).querySelector<HTMLElement>('li .name span')!;
      tap(name);
      expect(previewImage()).not.toBeNull();

      const handle = panel(page).querySelector<HTMLElement>('.handle')!;
      handle.dispatchEvent(pointer('pointerdown', 'mouse'));
      handle.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          buttons: 1,
          detail: 1,
          clientX: 10,
          clientY: 10,
        }),
      );
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 60 }),
      );
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 90 }),
      );
      TestBed.tick();
      expect(document.querySelector('.cdk-drag-preview')).not.toBeNull();
      expect(previewImage()).toBeNull();

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      hover(name);
      wait(150);
      tap(name);
      expect(previewImage()).toBeNull();

      // A hover begun in the drag doesn't open once the drag is released.
      hover(name);
      document.dispatchEvent(pointer('pointerup', 'mouse'));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      wait(150);
      expect(previewImage()).toBeNull();

      vi.useRealTimers();
      TestBed.tick();
      tap(name);
      expect(previewImage()).not.toBeNull();
    });
  });
});
