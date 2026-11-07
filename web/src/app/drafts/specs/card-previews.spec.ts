import { CdkDrag } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  PickView,
  PlanView,
  PoolCardView,
  PreferredPrintings,
  QueueView,
  UserView,
} from 'contract';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  openUrl,
  bob,
  alicePlayer,
  tabButton,
  panel,
  openDraft,
  flushPicks,
  completeSnapshot,
  decoded,
  wait,
  viewOn,
  previewImage,
  previewImages,
  ownTabStop,
  pointer,
  tap,
  pickOf,
  poolCardOf,
  faceImages,
  fireIce,
  invasion,
  aftermath,
  flipCard as flip,
  shownSideways,
  visible,
  queueOf,
  queued,
  flushQueueAndPlan,
  accessibleName,
  button,
  cardName,
  cardNames,
  namedList,
  type AppFixture,
} from './harness';
import { image, openDetail } from './pool-tab-harness';
import { detailOpener } from './plan-tab-harness';
import { openDialog, pressKey } from '../../specs-harness';

useDraftsApp();

describe('card previews', () => {
  const bolt = poolCardOf('bolt', 'Lightning Bolt');
  const shock = poolCardOf('shock', 'Shock');
  const pick = (number: number, card: PoolCardView, playerId = alice.id): PickView =>
    pickOf({
      pick: number,
      playerId,
      poolCardId: card.id,
    });

  /** Opens a draft with `picks` made and `options` as openDraft takes them. */
  async function openPicked(
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
  async function openBoard(options: Parameters<typeof openPicked>[0] = {}) {
    const opened = await openPicked(options);
    tabButton(opened.page, 'Board').click();
    await opened.fixture.whenStable();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    return opened;
  }

  /**
   * Opens the Queue tab of a draft whose pool has only Shock, with Bolt then
   * Shock queued, then takes over the clock. A queue names its cards, so Bolt
   * shows a name with no pool card.
   */
  async function openQueueWithoutBolt() {
    const opened = await openPicked({
      cards: [shock],
      picks: [],
      queue: queueOf({ cards: [queued(bolt), queued(shock)] }),
    });
    tabButton(opened.page, 'Queue').click();
    await opened.fixture.whenStable();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    return opened;
  }

  /**
   * Opens the Queue tab with Bolt queued, the pool's GET left for the test to
   * answer.
   */
  async function openQueueUnanswered() {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(
      draft({
        snapshot: completeSnapshot,
        state: 'Drafting',
        players: [alicePlayer, bob],
        turn: { pick: 1, round: 1, playerId: bob.id },
      }),
    );
    await flushPicks([]);
    await flushQueueAndPlan(queueOf({ cards: [queued(bolt)] }));
    const request = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool'));
    tabButton(page, 'Queue').click();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(cardName(panel(page), 'Lightning Bolt')).toBeDefined();
    });
    return { fixture, page, request };
  }

  afterEach(() => vi.useRealTimers());

  /**
   * The symbols a viewer reads before `name`, beside it in its card name: each
   * by its alt text, or its text if it has no SVG.
   */
  const costBefore = (name: HTMLElement) =>
    [...name.parentElement!.querySelectorAll<HTMLElement>('img, span')]
      .filter(
        (symbol) =>
          symbol.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING &&
          !name.contains(symbol) &&
          (symbol instanceof HTMLImageElement ||
            (symbol.children.length === 0 && symbol.textContent.trim() !== '')),
      )
      .map((symbol) => (symbol instanceof HTMLImageElement ? symbol.alt : symbol.textContent));
  function hover(name: HTMLElement) {
    name.dispatchEvent(pointer('pointerenter', 'mouse'));
  }
  function unhover(name: HTMLElement) {
    name.dispatchEvent(pointer('pointerleave', 'mouse'));
    TestBed.tick();
  }

  /** Starts dragging a queue row by its `handle`, with the mouse. */
  function startDrag(handle: HTMLElement) {
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
  }

  it('opens on the card’s normal front image after hovering a name for about 150ms', async () => {
    const { page } = await openBoard();

    hover(cardName(panel(page), 'Lightning Bolt'));
    wait(149);
    expect(previewImage()).toBeNull();
    wait(1);

    expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    expect(previewImage()?.getAttribute('alt')).toBe('Lightning Bolt');
  });

  it('closes as soon as the mouse leaves the name', async () => {
    const { page } = await openBoard();
    const name = cardName(panel(page), 'Lightning Bolt');

    hover(name);
    wait(150);
    unhover(name);

    expect(previewImage()).toBeNull();
  });

  it('opens nothing when the mouse crosses a list of names', async () => {
    const { page } = await openBoard();

    for (const text of ['Lightning Bolt', 'Shock']) {
      hover(cardName(panel(page), text));
      wait(100);
      unhover(cardName(panel(page), text));
    }
    wait(500);

    expect(previewImage()).toBeNull();
  });

  it('does nothing beyond hovering when a name is clicked with a mouse', async () => {
    const { page } = await openBoard();
    const name = cardName(panel(page), 'Lightning Bolt');

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
    expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
  });

  it('opens at once on a tap, and stays open with a touch’s enter and leave', async () => {
    const { page } = await openBoard();

    tap(cardName(panel(page), 'Lightning Bolt'));
    wait(1000);

    expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
  });

  it('switches to the card of another name tapped', async () => {
    const { page } = await openBoard();

    tap(cardName(panel(page), 'Lightning Bolt'));
    tap(cardName(panel(page), 'Shock'));

    expect(document.querySelectorAll('app-card-preview')).toHaveLength(1);
    expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));
  });

  it('closes on a tap elsewhere', async () => {
    const { page } = await openBoard();

    tap(cardName(panel(page), 'Lightning Bolt'));
    tap(page.querySelector('h1')!);

    expect(previewImage()).toBeNull();
  });

  it('closes on scrolling', async () => {
    const { page } = await openBoard();

    tap(cardName(panel(page), 'Lightning Bolt'));
    document.dispatchEvent(new Event('scroll'));
    TestBed.tick();

    expect(previewImage()).toBeNull();
  });

  it('takes each event’s pointer type, so one screen works with both', async () => {
    const { page } = await openBoard();

    tap(cardName(panel(page), 'Lightning Bolt'));
    hover(cardName(panel(page), 'Shock'));
    wait(150);
    expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));

    unhover(cardName(panel(page), 'Shock'));
    expect(previewImage()).toBeNull();
  });

  it('is view-only, with the front face only and the card’s shape reserved', async () => {
    const pathway = poolCardOf('pathway', 'Brightclimb Pathway', {
      images: faceImages('pathway-id', ['front', 'back']),
    });
    const { page } = await openBoard({ cards: [pathway], picks: [pick(1, pathway)] });

    tap(cardName(panel(page), 'Brightclimb Pathway'));

    const preview = document.querySelector('app-card-preview')!;
    expect(preview.querySelectorAll('button, a')).toHaveLength(0);
    expect(previewImages()).toHaveLength(1);
    expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'pathway-id'));
    expect(previewImage()?.getAttribute('width')).toBe('488');
    expect(previewImage()?.getAttribute('height')).toBe('680');
  });

  it('requests no image until it opens', async () => {
    const { page } = await openBoard();

    // Only the names' mana symbols, which aren't card images.
    expect(
      [...page.querySelectorAll('#board-panel img')].filter((img) => !img.closest('.cost')),
    ).toEqual([]);
    expect(previewImage()).toBeNull();
  });

  it('falls back to Scryfall’s API image, as the Pool tab does', async () => {
    const { page } = await openBoard();

    tap(cardName(panel(page), 'Lightning Bolt'));
    previewImage()!.dispatchEvent(new Event('error'));
    TestBed.tick();

    expect(previewImage()?.getAttribute('src')).toBe(
      'https://api.scryfall.com/cards/bolt-id?format=image&version=normal',
    );
  });

  it('fades its image in only once decoded, with no placeholder', async () => {
    const { page } = await openBoard();

    tap(cardName(panel(page), 'Lightning Bolt'));
    const preview = document.querySelector('app-card-preview')!;
    expect(visible(previewImage()!)).toBe(false);
    expect(previewImages()).toHaveLength(1);
    expect(preview.textContent.trim()).toBe('');

    await decoded(previewImage()!);

    expect(visible(previewImage()!)).toBe(true);
  });

  it('reveals the fallback once a failed image’s retry has decoded', async () => {
    const { page } = await openBoard();

    tap(cardName(panel(page), 'Lightning Bolt'));
    previewImage()!.dispatchEvent(new Event('error'));
    TestBed.tick();
    expect(visible(previewImage()!)).toBe(false);

    await decoded(previewImage()!);

    expect(previewImage()!.getAttribute('src')).toContain('api.scryfall.com');
    expect(visible(previewImage()!)).toBe(true);
  });

  it('fetches the pool once, for the Pool tab too', async () => {
    const { page } = await openBoard();

    tap(cardName(panel(page), 'Lightning Bolt'));
    tabButton(page, 'Pool').click();
    TestBed.tick();

    // The afterEach's verify would catch a second request left unanswered.
    http.expectNone('/api/drafts/draft-1/pool');
    expect(page.querySelector('.grid .placeholder')).not.toBeNull();
  });

  it('leaves a name out of the pool as plain text', async () => {
    const { page } = await openQueueWithoutBolt();

    tap(cardName(panel(page), 'Lightning Bolt'));
    hover(cardName(panel(page), 'Lightning Bolt'));
    wait(150);

    expect(previewImage()).toBeNull();
  });

  it('leaves names as plain text while the pool is loading or failed to load', async () => {
    const { fixture, page, request } = await openQueueUnanswered();

    tap(cardName(panel(page), 'Lightning Bolt'));
    expect(previewImage()).toBeNull();

    request.flush('', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    tap(cardName(panel(page), 'Lightning Bolt'));
    expect(previewImage()).toBeNull();
  });

  it('shows on names in the pick log and on your picks on the Export tab', async () => {
    const { fixture, page } = await openBoard();

    tap(cardNames(namedList(page, 'Pick log'))[0]!);
    expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));

    tabButton(page, 'Export').click();
    TestBed.tick();
    vi.useRealTimers();
    await fixture.whenStable();
    tap(page.querySelector('h1')!);
    tap(cardNames(namedList(page, 'Your picks'))[0]!);
    expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
  });

  describe('of horizontal cards', () => {
    it('shows a split card and a battle’s front face sideways', async () => {
      const { page } = await openBoard({
        cards: [fireIce, invasion],
        picks: [pick(1, fireIce), pick(2, invasion, bob.id)],
      });

      tap(cardName(panel(page), 'Fire // Ice'));
      expect(shownSideways(previewImage()!)).toBe(true);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'fire-ice-id'));

      tap(cardName(panel(page), 'Invasion of Zendikar // Awakened Skyclave'));
      expect(shownSideways(previewImage()!)).toBe(true);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'invasion-id'));
    });

    it('shows Aftermath cards, flip cards and other cards upright', async () => {
      const { page } = await openBoard({
        cards: [aftermath, flip, bolt],
        picks: [pick(1, aftermath), pick(2, flip, bob.id)],
      });

      for (const name of ['Cut // Ribbons', 'Budoka Gardener // Dokai, Weaver of Life']) {
        tap(cardName(panel(page), name));
        expect(shownSideways(previewImage()!)).toBe(false);
      }
    });

    it('shows a horizontal card sideways from its image in stacks mode, which stays upright', async () => {
      viewOn('desktop');
      try {
        const { page, fixture } = await openPicked({
          cards: [fireIce],
          picks: [pick(1, fireIce)],
          plan: {
            mainboard: [{ poolCardId: fireIce.id, name: fireIce.name, picked: true }],
            sideboard: [],
            basics: [],
            lost: [],
            preferredPrintings: {},
          },
        });
        tabButton(page, 'Plan').click();
        await fixture.whenStable();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const stacked = panel(page).querySelector<HTMLImageElement>('img[alt="Fire // Ice"]')!;

        hover(detailOpener(panel(page), 'Fire // Ice')!);
        wait(150);

        expect(shownSideways(previewImage()!)).toBe(true);
        expect(getComputedStyle(stacked).transform).not.toMatch(/rotate/);
      } finally {
        vi.unstubAllGlobals();
        localStorage.clear();
      }
    });
  });

  describe('from the keyboard', () => {
    /** Tabs to `name`, as a keyboard user does, and renders what came of it. */
    function tabTo(name: HTMLElement) {
      pressKey((document.activeElement as HTMLElement | null) ?? document.body, 'Tab');
      name.focus();
      TestBed.tick();
    }
    /** Tabs on from `name` to somewhere with no Card preview. */
    function tabAway(name: HTMLElement) {
      pressKey(name, 'Tab');
      name.blur();
      TestBed.tick();
    }
    function pressEscape() {
      pressKey((document.activeElement as HTMLElement | null) ?? document.body, 'Escape');
    }
    /** Starts dragging the queued card named `name`, as the drag's start says. */
    function dragStarted(fixture: AppFixture, name: string) {
      fixture.debugElement
        .query(By.css('app-queue-tab'))
        .queryAll(By.directive(CdkDrag))
        .find((drag) => accessibleName(drag.nativeElement).includes(name))!
        .triggerEventHandler('cdkDragStarted', {});
      TestBed.tick();
    }

    it('opens at once on tabbing to a name on the Board tab', async () => {
      const { page } = await openBoard();
      const name = cardName(panel(page), 'Lightning Bolt');

      expect(name.tabIndex).toBe(0);
      tabTo(name);

      expect(document.activeElement).toBe(name);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    it('closes on tabbing away, and moves to the next name tabbed to', async () => {
      const { page } = await openBoard();
      const bolt = cardName(panel(page), 'Lightning Bolt');

      tabTo(bolt);
      tabTo(cardName(panel(page), 'Shock'));
      expect(previewImages()).toHaveLength(1);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));

      tabAway(cardName(panel(page), 'Shock'));
      expect(previewImage()).toBeNull();
    });

    it('leaves open a preview the mouse has opened on another name', async () => {
      const { page } = await openBoard();
      const bolt = cardName(panel(page), 'Lightning Bolt');

      tabTo(bolt);
      hover(cardName(panel(page), 'Shock'));
      wait(150);
      tabAway(bolt);

      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));
    });

    it('skips a name with no pool card', async () => {
      const { page } = await openQueueWithoutBolt();

      expect(cardName(panel(page), 'Lightning Bolt').tabIndex).toBe(-1);
      expect(cardName(panel(page), 'Shock').tabIndex).toBe(0);
    });

    it('opens nothing through focus when a name is clicked with a mouse', async () => {
      const { page } = await openBoard();
      const name = cardName(panel(page), 'Lightning Bolt');

      hover(name);
      name.dispatchEvent(pointer('pointerdown', 'mouse'));
      name.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      name.focus();
      name.click();
      TestBed.tick();
      expect(document.activeElement).toBe(name);
      expect(previewImage()).toBeNull();

      wait(149);
      expect(previewImage()).toBeNull();
      wait(1);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    it('closes on Escape however it opened, leaving focus where it was', async () => {
      const { page } = await openBoard();
      const name = cardName(panel(page), 'Lightning Bolt');

      hover(name);
      wait(150);
      pressEscape();
      expect(previewImage()).toBeNull();
      unhover(name);

      tap(name);
      pressEscape();
      expect(previewImage()).toBeNull();

      tabTo(name);
      pressEscape();
      expect(previewImage()).toBeNull();
      expect(document.activeElement).toBe(name);
    });

    it('cancels a pending hover on Escape', async () => {
      const { page } = await openBoard();

      hover(cardName(panel(page), 'Lightning Bolt'));
      wait(100);
      pressEscape();
      wait(500);

      expect(previewImage()).toBeNull();
    });

    it('closes the Pool tab’s Card detail on the same Escape', async () => {
      const { fixture, page } = await openBoard();
      tap(cardName(panel(page), 'Lightning Bolt'));
      tabButton(page, 'Pool').click();
      vi.useRealTimers();
      await fixture.whenStable();
      expect(await openDetail(fixture, page, 0)).not.toBeNull();
      expect(previewImage()).not.toBeNull();

      pressEscape();
      await fixture.whenStable();

      expect(previewImage()).toBeNull();
      expect(openDialog()).toBeNull();
    });

    it('opens on names tabbed to on the Export tab', async () => {
      const { fixture, page } = await openBoard();
      tabButton(page, 'Export').click();
      vi.useRealTimers();
      await fixture.whenStable();

      tabTo(ownTabStop(panel(page), 'Lightning Bolt')!);

      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    it('opens on names tabbed to on the Queue tab, but not while a drag is under way', async () => {
      const opened = await openPicked({
        queue: queueOf({ cards: [{ poolCardId: shock.id, name: shock.name }] }),
      });
      const { page, fixture } = opened;
      tabButton(page, 'Queue').click();
      await fixture.whenStable();
      const name = ownTabStop(panel(page), 'Shock')!;

      tabTo(name);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));
      tabAway(name);

      dragStarted(fixture, 'Shock');
      tabTo(name);
      expect(previewImage()).toBeNull();
    });

    it('opens on list mode names, which are buttons there, tabbed to on the Plan tab', async () => {
      const { page, fixture } = await openPicked({
        plan: {
          mainboard: [{ poolCardId: bolt.id, name: bolt.name, picked: true }],
          sideboard: [],
          basics: [],
          lost: [],
          preferredPrintings: {},
        },
      });
      tabButton(page, 'Plan').click();
      await fixture.whenStable();

      tabTo(button(panel(page), 'Lightning Bolt')!);

      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    it('adds no Tab stop for a card shown in stacks mode', async () => {
      viewOn('desktop');
      try {
        const { page, fixture } = await openPicked({
          plan: {
            mainboard: [{ poolCardId: bolt.id, name: bolt.name, picked: true }],
            sideboard: [],
            basics: [],
            lost: [],
            preferredPrintings: {},
          },
        });
        tabButton(page, 'Plan').click();
        await fixture.whenStable();

        expect(panel(page).querySelector('img[alt="Lightning Bolt"]')).not.toBeNull();
        expect(ownTabStop(panel(page), 'Lightning Bolt')).toBeUndefined();
      } finally {
        vi.unstubAllGlobals();
        localStorage.clear();
      }
    });
  });

  describe('mana costs', () => {
    it('show before names on the Board tab, as symbols with alt and title text', async () => {
      const { page } = await openBoard({
        cards: [{ ...bolt, manaCost: '{1}{R}' }, shock],
      });

      const name = cardName(panel(page), 'Lightning Bolt');
      expect(costBefore(name)).toEqual(['one generic mana', 'one red mana']);
      const symbol = name.previousElementSibling!.querySelector('img')!;
      expect(symbol.getAttribute('src')).toBe('mana/1.svg');
      expect(symbol.title).toBe('one generic mana');
    });

    it('show a symbol the app has no SVG for as its text', async () => {
      const { page } = await openBoard({ cards: [{ ...bolt, manaCost: '{H}{R}' }, shock] });

      expect(costBefore(cardName(panel(page), 'Lightning Bolt'))).toEqual(['{H}', 'one red mana']);
    });

    it('show once the pool card has loaded, the name alone until then', async () => {
      const { fixture, page, request } = await openQueueUnanswered();

      expect(costBefore(cardName(panel(page), 'Lightning Bolt'))).toEqual([]);

      request.flush([bolt]);
      await fixture.whenStable();
      expect(costBefore(cardName(panel(page), 'Lightning Bolt'))).toEqual(['one red mana']);
    });

    it('show before names in the pick log and on the Export tab', async () => {
      const { fixture, page } = await openBoard();

      expect(costBefore(cardNames(namedList(page, 'Pick log'))[0]!)).toEqual(['one red mana']);

      tabButton(page, 'Export').click();
      vi.useRealTimers();
      await fixture.whenStable();
      expect(costBefore(cardNames(namedList(page, 'Your picks'))[0]!)).toEqual(['one red mana']);
    });
  });

  describe('in the plan', () => {
    it('shows on plan rows when the mouse rests on them', async () => {
      const { page, fixture } = await openPicked({
        plan: {
          mainboard: [{ poolCardId: bolt.id, name: bolt.name, picked: true }],
          sideboard: [],
          basics: [],
          lost: [],
          preferredPrintings: {},
        },
      });
      tabButton(page, 'Plan').click();
      await fixture.whenStable();

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      hover(cardName(panel(page), 'Lightning Bolt'));
      wait(150);
      vi.useRealTimers();
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    /** Opens the Plan tab with Lightning Bolt on the mainboard, Shock on the sideboard, and Bolt lost. */
    async function openPlan() {
      const opened = await openPicked({
        plan: {
          mainboard: [{ poolCardId: bolt.id, name: bolt.name, picked: true }],
          sideboard: [{ poolCardId: shock.id, name: shock.name, picked: true }],
          basics: [],
          lost: [{ poolCardId: bolt.id, name: bolt.name, pickedBy: bob.id }],
          preferredPrintings: {},
        },
      });
      tabButton(opened.page, 'Plan').click();
      await opened.fixture.whenStable();
      return opened;
    }

    it('shows mana costs before list lines’ names, each plan board its own list', async () => {
      const { page } = await openPlan();

      const lists = [...panel(page).querySelectorAll<HTMLElement>('.plan-board .card-rows')];
      expect(
        lists.map((list) =>
          [...list.querySelectorAll<HTMLElement>('app-card-name .name')].map((name) => [
            name.textContent?.trim(),
            costBefore(name),
          ]),
        ),
      ).toEqual([[['Lightning Bolt', ['one red mana']]], [['Shock', ['one red mana']]]]);
    });

    it('shows mana costs inline in the Plan notice', async () => {
      const { page } = await openPlan();

      const notice = panel(page).querySelector<HTMLElement>('.notice')!;
      expect(costBefore(notice.querySelector<HTMLElement>('strong .name')!)).toEqual([
        'one red mana',
      ]);
      expect(notice.querySelector('.card-rows')).toBeNull();
    });

    it('shows no mana costs on stacks’ card images', async () => {
      viewOn('desktop');
      try {
        const { page } = await openPlan();

        expect(panel(page).querySelector('.stacks')).not.toBeNull();
        expect(panel(page).querySelector('.stacks .cost')).toBeNull();
      } finally {
        vi.unstubAllGlobals();
        localStorage.clear();
      }
    });

    /** Opens the Plan tab with two Swamps, `preferredPrintings` the player's, and hovers one until its Card preview opens. */
    async function previewSwamp(preferredPrintings: PreferredPrintings = {}) {
      const { page, fixture } = await openPicked({
        plan: {
          mainboard: [],
          sideboard: [],
          basics: [{ land: 'Swamp', count: 2 }],
          lost: [],
          preferredPrintings,
        },
      });
      tabButton(page, 'Plan').click();
      await fixture.whenStable();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      hover(cardName(panel(page), 'Swamp'));
      wait(150);
      vi.useRealTimers();
    }

    it('shows on a basic land, though it isn’t a pool card', async () => {
      await previewSwamp();

      expect(previewImage()?.getAttribute('src')).toBe(
        'https://cards.scryfall.io/normal/front/0/3/0356ae45-e5ca-46b9-8ebc-42bf4776e89c.jpg',
      );
    });

    it('falls back to Scryfall’s API image of a basic land’s default printing', async () => {
      await previewSwamp();

      previewImage()!.dispatchEvent(new Event('error'));
      TestBed.tick();

      expect(previewImage()?.getAttribute('src')).toBe(
        'https://api.scryfall.com/cards/0356ae45-e5ca-46b9-8ebc-42bf4776e89c?format=image&version=normal',
      );
    });

    const ZNR_SWAMP = 'd0000000-0000-4000-8000-000000000271';
    const znrSwamp = {
      scryfallId: ZNR_SWAMP,
      set: 'znr',
      collectorNumber: '271',
      images: {
        small: `https://cards.scryfall.io/small/front/d/0/${ZNR_SWAMP}.jpg`,
        normal: `https://cards.scryfall.io/normal/front/d/0/${ZNR_SWAMP}.jpg`,
        large: `https://cards.scryfall.io/large/front/d/0/${ZNR_SWAMP}.jpg`,
      },
    };

    it('shows a basic land’s preferred printing', async () => {
      await previewSwamp({ Swamp: znrSwamp });

      expect(previewImage()?.getAttribute('src')).toBe(znrSwamp.images.normal);
    });

    it('falls back to Scryfall’s API image of a preferred printing', async () => {
      await previewSwamp({ Swamp: znrSwamp });

      previewImage()!.dispatchEvent(new Event('error'));
      TestBed.tick();

      expect(previewImage()?.getAttribute('src')).toBe(
        `https://api.scryfall.com/cards/${ZNR_SWAMP}?format=image&version=normal`,
      );
    });
  });

  describe('in the queue', () => {
    const queue: QueueView = queueOf({
      cards: [{ poolCardId: shock.id, name: shock.name }],
      lost: [{ poolCardId: bolt.id, name: bolt.name }],
    });

    async function openQueue() {
      const opened = await openPicked({ queue });
      tabButton(opened.page, 'Queue').click();
      await opened.fixture.whenStable();
      return opened;
    }

    it('shows on queue rows and the queue lost notice', async () => {
      const { page } = await openQueue();

      tap(panel(page).querySelector<HTMLElement>('li app-card-name .name')!);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));

      tap(panel(page).querySelector<HTMLElement>('.notice strong .name')!);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    it('shows mana costs before queue rows’ names, and inline in the Queue notice', async () => {
      const { page } = await openQueue();

      expect(costBefore(panel(page).querySelector<HTMLElement>('.queue .name')!)).toEqual([
        'one red mana',
      ]);
      const notice = panel(page).querySelector<HTMLElement>('.notice')!;
      expect(costBefore(notice.querySelector<HTMLElement>('strong .name')!)).toEqual([
        'one red mana',
      ]);
      expect(notice.querySelector('.card-rows')).toBeNull();
    });

    it('closes when a drag starts, and opens none until it is released', async () => {
      const { page } = await openQueue();
      const name = panel(page).querySelector<HTMLElement>('li app-card-name .name')!;
      tap(name);
      expect(previewImage()).not.toBeNull();

      startDrag(panel(page).querySelector<HTMLElement>('.handle')!);
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
