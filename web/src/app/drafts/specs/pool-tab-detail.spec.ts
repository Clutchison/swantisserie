import { TestBed } from '@angular/core/testing';
import { EMPTY_PLAN } from '../drafts';
import {
  useDraftsApp,
  openDraft,
  completeSnapshot,
  button,
  buttonOrder,
  decoded,
  drafting,
  queueOf,
  queued,
  decodeRefused,
  wait,
  fireIce,
  room,
  invasion,
  aftermath,
  flipCard,
  shownSideways,
  inSidewaysBox,
  visible,
  text,
  controlByLabel,
  alice,
} from './harness';
import {
  clickBackdrop,
  hiddenFromAssistiveTech,
  openDialog,
  pressEscape,
  pressTab,
} from '../../specs-harness';
import {
  useTallScreen,
  image,
  card,
  shivan,
  brightclimb,
  openDetail,
  tiles,
  largeImages,
  newestLarge,
  tileLoaded,
  largePlaceholder,
  searchBox,
  searchFor,
  scrollWindowTo,
} from './pool-tab-harness';
import { apiImage, unpicked } from './plan-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  it('opens a card’s large image when it is tapped, and closes it again', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      {},
      { cards: [brightclimb, shivan] },
    );

    const detail = await openDetail(fixture, page, 1);
    expect(detail.getAttribute('aria-label')).toBe('Shivan Dragon');
    expect(newestLarge(detail).getAttribute('src')).toBe(image('large', 'shivan-id'));
    expect(button(detail, 'Flip')).toBeUndefined();

    button(detail, 'Close')!.click();
    await fixture.whenStable();
    expect(openDialog()).toBeNull();
  });

  it('keeps the large image hidden until it has decoded', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [shivan] });

    const detail = await openDetail(fixture, page, 0);
    const large = detail.querySelector<HTMLImageElement>(
      `img[src="${image('large', 'shivan-id')}"]`,
    )!;
    expect(large.classList).not.toContain('shown');

    await decoded(large);

    expect(large.classList).toContain('shown');
  });

  it('flips a double-faced card between its faces', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      {},
      { cards: [brightclimb, shivan] },
    );

    const detail = await openDetail(fixture, page, 0);
    expect(newestLarge(detail).getAttribute('src')).toBe(image('large', 'brightclimb-id', 'front'));

    button(detail, 'Flip')!.click();
    await fixture.whenStable();
    expect(newestLarge(detail).getAttribute('src')).toBe(image('large', 'brightclimb-id', 'back'));

    button(detail, 'Flip')!.click();
    await fixture.whenStable();
    expect(newestLarge(detail).getAttribute('src')).toBe(image('large', 'brightclimb-id', 'front'));
  });

  it('falls back to Scryfall’s API image of the face shown when a detail image fails to load', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [brightclimb] });

    const detail = await openDetail(fixture, page, 0);
    button(detail, 'Flip')!.click();
    await fixture.whenStable();
    newestLarge(detail).dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(newestLarge(detail).getAttribute('src')).toBe(
      apiImage('large', 'brightclimb-id', 'back'),
    );
  });

  it('offers Close, Flip, the Plan and queue buttons, then Pick, on the player’s turn', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: { pick: 1, round: 1, playerId: alice.id } }),
      {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(brightclimb)] }),
        plan: { ...EMPTY_PLAN, mainboard: [unpicked(brightclimb)] },
      },
    );

    const detail = await openDetail(fixture, page, 0);

    expect(buttonOrder(detail, 'Pick')).toEqual([
      'Close',
      'Flip',
      'Remove from Plan',
      'Remove from queue',
      'Pick',
    ]);
  });

  describe('focus', () => {
    /** Opens the Pool tab with Brightclimb Pathway and Shivan Dragon, and the Card detail of the `index`th, from its focused tile. */
    async function openFromTile(index: number) {
      const opened = await openDraft(completeSnapshot, {}, { cards: [brightclimb, shivan] });
      tiles(opened.page)[index].focus();
      const detail = await openDetail(opened.fixture, opened.page, index);
      await vi.waitFor(() => expect(document.activeElement).toBe(button(detail, 'Close')));
      return { ...opened, detail };
    }

    it('stays inside the Card detail, wrapping from its last control to its first and back', async () => {
      const { detail } = await openFromTile(0);

      pressTab({ shift: true });
      expect(document.activeElement).toBe(button(detail, 'Flip'));
      pressTab();
      expect(document.activeElement).toBe(button(detail, 'Close'));
    });

    it('hides the page behind the Card detail from assistive technology while it is open', async () => {
      const { fixture, page, detail } = await openFromTile(1);

      expect(hiddenFromAssistiveTech(tiles(page)[1])).toBe(true);
      expect(hiddenFromAssistiveTech(detail)).toBe(false);

      button(detail, 'Close')!.click();
      await fixture.whenStable();
      expect(hiddenFromAssistiveTech(tiles(page)[1])).toBe(false);
    });

    it.each<[string, () => void]>([
      ['Close', () => button(openDialog()!, 'Close')!.click()],
      ['Escape', pressEscape],
      ['a backdrop click', clickBackdrop],
    ])('returns to the card’s tile on %s', async (_, close) => {
      const { fixture, page } = await openFromTile(1);

      close();
      await fixture.whenStable();

      expect(openDialog()).toBeNull();
      expect(document.activeElement).toBe(tiles(page)[1]);
    });

    it('returns to the card’s tile, with picked cards hidden, when it closes without a pick', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        {},
        { cards: [brightclimb, shivan] },
      );
      controlByLabel(page, 'checkbox', 'Hide picked')!.click();
      await fixture.whenStable();
      tiles(page)[1].focus();
      await openDetail(fixture, page, 1);

      pressEscape();
      await fixture.whenStable();

      expect(document.activeElement).toBe(tiles(page)[1]);
    });

    it('returns to the card’s tile when the grid has moved it to another', async () => {
      const { fixture, page } = await openFromTile(1);

      // Moves the card up a row, which gives it a new tile.
      searchFor(page, 'shivan');
      button(openDialog()!, 'Close')!.click();
      await fixture.whenStable();

      expect(tiles(page)).toHaveLength(1);
      expect(document.activeElement).toBe(tiles(page)[0]);
    });

    it('goes to the pool search box when the card’s tile is no longer in the grid', async () => {
      const { fixture, page } = await openFromTile(1);

      searchFor(page, 'brightclimb');
      pressEscape();
      await fixture.whenStable();

      expect(document.activeElement).toBe(searchBox(page));
    });

    it('goes to the pool search box when the grid has scrolled the card’s tile out of view', async () => {
      const cards = Array.from({ length: 40 }, (_, i) =>
        card({ id: `card-${i}`, scryfallId: `id-${i}`, name: `Card ${i}` }),
      );
      const { fixture, page } = await openDraft(completeSnapshot, {}, { cards });
      tiles(page)[0].focus();
      await openDetail(fixture, page, 0);

      scrollWindowTo(20_000);
      await vi.waitFor(() => {
        TestBed.tick();
        expect(tiles(page).some((tile) => tile.textContent?.includes('Card 0'))).toBe(false);
      });
      button(openDialog()!, 'Close')!.click();
      await fixture.whenStable();

      expect(document.activeElement).toBe(searchBox(page));
    });
  });

  describe('of a horizontal card', () => {
    it.each([
      ['a split card', fireIce],
      ['a Room', room],
      ['a battle’s front face', invasion],
    ])('shows %s turned sideways, its tile upright', async (_, horizontal) => {
      const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [horizontal] });

      const detail = await openDetail(fixture, page, 0);

      expect(shownSideways(newestLarge(detail))).toBe(true);
      expect(getComputedStyle(tiles(page)[0].querySelector('img')!).transform).not.toMatch(
        /rotate/,
      );
    });

    it.each([
      ['an Aftermath card', aftermath],
      ['a flip card', flipCard],
    ])('shows %s upright', async (_, upright) => {
      const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [upright] });

      const detail = await openDetail(fixture, page, 0);

      expect(shownSideways(newestLarge(detail))).toBe(false);
    });

    it('shows a battle’s back face upright after Flip, keeping the front sideways until it has decoded', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [invasion] });
      const detail = await openDetail(fixture, page, 0);
      await decoded(newestLarge(detail));

      button(detail, 'Flip')!.click();
      await fixture.whenStable();
      const front = largeImages(detail).find(visible)!;
      expect(front.getAttribute('src')).toBe(image('large', 'invasion-id', 'front'));
      expect(shownSideways(front)).toBe(true);

      // Each image in the box it was turned for, with no crossfade between shapes.
      await decoded(newestLarge(detail));
      expect(newestLarge(detail).getAttribute('src')).toBe(image('large', 'invasion-id', 'back'));
      expect(largeImages(detail).map(shownSideways)).toEqual([false]);

      button(detail, 'Flip')!.click();
      await fixture.whenStable();
      await decoded(newestLarge(detail));
      expect(largeImages(detail).map(shownSideways)).toEqual([true]);
    });

    it('turns the tile’s image sideways too while the large image loads', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [fireIce] });
      tileLoaded(tiles(page)[0], image('normal', 'fire-ice-id'));

      const detail = await openDetail(fixture, page, 0);

      expect(largePlaceholder(detail)?.getAttribute('src')).toBe(image('normal', 'fire-ice-id'));
      expect(shownSideways(largePlaceholder(detail)!)).toBe(true);
    });

    it('fills a sideways box with the name, which stays upright, while the large image loads', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [fireIce] });

      const detail = await openDetail(fixture, page, 0);
      const name = largePlaceholder(detail)!;

      expect(name.textContent).toBe('Fire // Ice');
      expect(inSidewaysBox(name)).toBe(true);
      expect(getComputedStyle(name).transform).not.toMatch(/rotate/);
    });
  });

  describe('while its image is on the way', () => {
    /** Opens the Card detail of the only tile, with `prepare` run on the tile first. */
    async function openOne(
      card: typeof shivan,
      prepare: (tile: HTMLElement) => void = () => undefined,
    ) {
      const opened = await openDraft(completeSnapshot, {}, { cards: [card] });
      prepare(tiles(opened.page)[0]);
      const detail = await openDetail(opened.fixture, opened.page, 0);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      return { ...opened, detail };
    }
    const placeholder = largePlaceholder;
    const shownSrcs = (detail: HTMLElement) =>
      largeImages(detail)
        .filter((img) => img.classList.contains('shown'))
        .map((img) => img.getAttribute('src'));
    const front = image('large', 'brightclimb-id', 'front');
    const back = image('large', 'brightclimb-id', 'back');

    function flip(detail: HTMLElement) {
      button(detail, 'Flip')!.click();
      wait(0);
    }

    afterEach(() => vi.useRealTimers());

    it('shows the tile’s image if the tile loaded the normal one', async () => {
      const { detail } = await openOne(shivan, (tile) =>
        tileLoaded(tile, image('normal', 'shivan-id')),
      );

      expect(placeholder(detail)?.getAttribute('src')).toBe(image('normal', 'shivan-id'));
    });

    it('shows an empty card shape with the name if the tile loaded the small image', async () => {
      const { detail } = await openOne(shivan, (tile) =>
        tileLoaded(tile, image('small', 'shivan-id')),
      );

      expect(text(placeholder(detail))).toBe('Shivan Dragon');
    });

    it('shows an empty card shape with the name if the tile is still loading the normal image', async () => {
      const { detail } = await openOne(shivan, (tile) =>
        Object.defineProperties(tile.querySelector('img')!, {
          complete: { value: false },
          // A progressive JPEG's size is known before it has all loaded.
          naturalWidth: { value: 488 },
          currentSrc: { value: image('normal', 'shivan-id') },
        }),
      );

      expect(text(placeholder(detail))).toBe('Shivan Dragon');
    });

    it('shows an empty card shape with the name if the tile has no image yet', async () => {
      // The browser hasn't said the tile is on screen, so it hasn't requested its image.
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
      onTestFinished(() => void vi.unstubAllGlobals());
      const { detail, page } = await openOne(shivan);

      expect(tiles(page)[0].querySelector('img')).toBeNull();
      expect(text(placeholder(detail))).toBe('Shivan Dragon');
    });

    it('crossfades from the placeholder, which goes once the fade is over', async () => {
      const { detail } = await openOne(shivan);

      await decoded(newestLarge(detail));
      expect(newestLarge(detail).classList).not.toContain('instant');
      wait(149);
      expect(placeholder(detail)).not.toBeNull();
      wait(1);
      expect(placeholder(detail)).toBeNull();
    });

    it('appears with no fade if already loaded when the Card detail opens', async () => {
      vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
      vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(672);
      const { detail } = await openOne(shivan);

      await decoded(newestLarge(detail));

      expect(newestLarge(detail).classList).toContain('instant');
      expect(placeholder(detail)).toBeNull();
    });

    it('keeps the current face until the other has decoded, then crossfades to it', async () => {
      const { detail } = await openOne(brightclimb);
      await decoded(newestLarge(detail));
      wait(150);

      flip(detail);
      expect(shownSrcs(detail)).toEqual([front]);

      await decoded(newestLarge(detail));
      expect(shownSrcs(detail)).toEqual([front, back]);
      expect(newestLarge(detail).classList).not.toContain('instant');

      wait(150);
      expect(shownSrcs(detail)).toEqual([back]);
    });

    it('crossfades to a face the browser has already loaded', async () => {
      const { detail } = await openOne(brightclimb);
      await decoded(newestLarge(detail));
      wait(150);
      vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
      vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(672);

      flip(detail);
      await decoded(newestLarge(detail));

      expect(shownSrcs(detail)).toEqual([front, back]);
    });

    it('gives a face revealed during the last one’s fade a full fade of its own', async () => {
      const { detail } = await openOne(brightclimb);
      await decoded(newestLarge(detail));
      wait(100);

      flip(detail);
      await decoded(newestLarge(detail));
      expect(shownSrcs(detail)).toEqual([front, back]);

      // Past the end of the front's fade.
      wait(100);
      expect(shownSrcs(detail)).toEqual([front, back]);
      wait(50);
      expect(shownSrcs(detail)).toEqual([back]);
    });

    it('names only the image in front to screen readers', async () => {
      const { detail } = await openOne(brightclimb);
      await decoded(newestLarge(detail));
      wait(150);

      flip(detail);

      expect(largeImages(detail).map((img) => img.getAttribute('alt'))).toEqual([
        brightclimb.name,
        '',
      ]);
    });

    it('ignores a face flipped away from before it decoded', async () => {
      const { detail } = await openOne(brightclimb);
      await decoded(newestLarge(detail));
      wait(150);

      flip(detail);
      const stale = newestLarge(detail);
      flip(detail);
      await decoded(stale);

      expect(shownSrcs(detail)).toEqual([front]);
      expect(largeImages(detail)).toHaveLength(1);
    });

    it('never shows an image from a Card detail that was closed on the next card opened', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        {},
        { cards: [brightclimb, shivan] },
      );
      const first = await openDetail(fixture, page, 0);
      const stale = newestLarge(first);
      button(first, 'Close')!.click();
      await fixture.whenStable();

      const second = await openDetail(fixture, page, 1);
      await decoded(stale);

      expect(shownSrcs(second)).toEqual([]);
      expect(newestLarge(second).getAttribute('src')).toBe(image('large', 'shivan-id'));
    });

    it('starts afresh when another card opens over one still showing', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        {},
        { cards: [brightclimb, shivan] },
      );
      await decoded(newestLarge(await openDetail(fixture, page, 0)));

      const detail = await openDetail(fixture, page, 1);

      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      expect(shownSrcs(detail)).toEqual([]);
      expect(largeImages(detail).map((img) => img.getAttribute('src'))).toEqual([
        image('large', 'shivan-id'),
      ]);
      expect(detail.textContent).toContain('Shivan Dragon');
    });

    it('reveals the fallback once a failed image’s retry has decoded', async () => {
      const { detail } = await openOne(shivan);

      newestLarge(detail).dispatchEvent(new Event('error'));
      wait(0);
      const fallback = newestLarge(detail);
      expect(fallback.getAttribute('src')).toContain('api.scryfall.com');
      expect(fallback.classList).not.toContain('shown');

      await decoded(fallback);
      expect(fallback.classList).toContain('shown');
    });

    it('keeps the placeholder, and the actions usable, if the fallback fails too', async () => {
      const { detail } = await openOne(shivan);

      newestLarge(detail).dispatchEvent(new Event('error'));
      wait(0);
      newestLarge(detail).dispatchEvent(new Event('error'));
      wait(0);

      expect(shownSrcs(detail)).toEqual([]);
      expect(detail.textContent).toContain('Shivan Dragon');
      expect(button(detail, 'Close')!.disabled).toBe(false);
    });

    it('keeps the current face if the other face’s images both fail', async () => {
      const { detail } = await openOne(brightclimb);
      await decoded(newestLarge(detail));
      wait(150);

      flip(detail);
      newestLarge(detail).dispatchEvent(new Event('error'));
      wait(0);
      newestLarge(detail).dispatchEvent(new Event('error'));
      wait(0);

      expect(shownSrcs(detail)).toEqual([front]);
    });

    it('reveals a fully loaded image the browser refused to decode ahead of time', async () => {
      const { detail } = await openOne(shivan);
      const large = newestLarge(detail);
      Object.defineProperties(large, {
        complete: { value: true },
        naturalWidth: { value: 672 },
      });

      await decodeRefused(large);

      expect(large.classList).toContain('shown');
    });

    it('stays hidden if decoding was refused partway through loading', async () => {
      const { detail } = await openOne(shivan);
      const large = newestLarge(detail);
      Object.defineProperties(large, {
        complete: { value: false },
        naturalWidth: { value: 672 },
      });

      await decodeRefused(large);

      expect(large.classList).not.toContain('shown');
    });

    it('stays hidden if decoding was refused because the image never loaded', async () => {
      const { detail } = await openOne(shivan);
      const large = newestLarge(detail);

      await decodeRefused(large);

      expect(large.classList).not.toContain('shown');
    });
  });
});
