import { TestBed } from '@angular/core/testing';
import type {
  BasicLandPrintingsView,
  BasicLandPrintingView,
  PlanView,
  PreferredPrintingProblem,
} from 'contract';
import {
  useDraftsApp,
  http,
  openDraft,
  completeSnapshot,
  alertIn,
  button,
  comboboxOptions,
  comboboxStatus,
  editableCombobox,
  heading,
  highlightedOption,
  namedImages,
  namedList,
  viewOn,
  type AppFixture,
  drafting,
  openTab,
  typeInto,
} from './harness';
import { clickBackdrop, openDialog, pressEscape, pressKey, text } from '../../specs-harness';
import { useTallScreen, shivan } from './pool-tab-harness';
import { bobsTurn, bolt, openPlan, planned, printingsRequest } from './plan-tab-harness';
import { playing, withTournament } from './play-tab-harness';

useDraftsApp();
useTallScreen();

describe('the Printing picker', () => {
  const cards = [shivan, bolt];
  /** The API request the picker sends for the stored printings of Island. */
  const islandRequest = printingsRequest('Island');
  const ONS_335 = '36e062ec-df51-40c0-ad8a-2ee1cb8f8f17';
  const KHM_394 = 'a0000000-0000-4000-8000-000000000394';
  const cdn = (version: string, id: string) =>
    `https://cards.scryfall.io/${version}/front/${id[0]}/${id[1]}/${id}.jpg`;
  /** An English Island printing as the API shows it. */
  const printing = (id: string, set: string, number: string): BasicLandPrintingView => ({
    scryfallId: id,
    set,
    collectorNumber: number,
    images: { small: cdn('small', id), normal: cdn('normal', id), large: cdn('large', id) },
  });
  /** Kaldheim's three, Core Set 2021's one, Dragons of Tarkir's one and Onslaught's two, as the API groups them. */
  const islands: BasicLandPrintingsView = {
    sets: [
      {
        code: 'khm',
        name: 'Kaldheim',
        releasedAt: '2021-02-05',
        printings: [
          printing(KHM_394, 'khm', '394'),
          printing('a0000000-0000-4000-8000-000000000395', 'khm', '395'),
          printing('a0000000-0000-4000-8000-000000000396', 'khm', '396'),
        ],
      },
      {
        code: 'm21',
        name: 'Core Set 2021',
        releasedAt: '2020-07-03',
        printings: [printing('c0000000-0000-4000-8000-000000000250', 'm21', '250')],
      },
      {
        code: 'dtk',
        name: 'Dragons of Tarkir',
        releasedAt: '2015-03-27',
        printings: [printing('d0000000-0000-4000-8000-000000000250', 'dtk', '250')],
      },
      {
        code: 'ons',
        name: 'Onslaught',
        releasedAt: '2002-10-07',
        printings: [
          printing(ONS_335, 'ons', '335'),
          printing('b0000000-0000-4000-8000-000000000336', 'ons', '336'),
        ],
      },
    ],
  };
  /** Kaldheim's #394 as the API shows a preferred printing. */
  const khm394 = islands.sets[0].printings[0];
  const withIslands = (fields: Partial<PlanView> = {}): PlanView => ({
    mainboard: [planned(bolt), planned(shivan)],
    sideboard: [],
    basics: [{ land: 'Island', count: 2 }],
    lost: [],
    preferredPrintings: {},
    ...fields,
  });

  beforeEach(() => viewOn('desktop'));
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  /** Opens the Plan tab of a drafting draft, Alice's plan `plan`. */
  async function openWith(plan = withIslands()) {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan,
    });
    return { fixture, page, plan: await openPlan(fixture, page) };
  }
  /** The control that opens a stacked Island's Printing picker. */
  const stackedIsland = (plan: HTMLElement) =>
    [...namedList(plan, 'Lands').querySelectorAll<HTMLElement>('[aria-haspopup="dialog"]')][0];
  /** Opens the picker from the first stacked Island, and answers its request with `printings`. The page is stable once it is answered. */
  async function openPicker(fixture: AppFixture, plan: HTMLElement, printings = islands) {
    stackedIsland(plan).click();
    (await vi.waitFor(() => http.expectOne(islandRequest))).flush(printings);
    await fixture.whenStable();
    return openDialog()!;
  }
  /** The Set field in the open picker. */
  const setField = () => editableCombobox(openDialog()!, 'Set');
  /** The sets the Set field's list offers, by their text. */
  const setOptions = () => comboboxOptions(setField()!).map((option) => text(option));
  /** Moves focus to the Set field, which opens its list. */
  function openSets() {
    setField()!.blur();
    setField()!.focus();
    TestBed.tick();
  }
  /** Chooses the set whose option reads `name`, by a click on it. */
  async function chooseSet(fixture: AppFixture, name: string) {
    openSets();
    comboboxOptions(setField()!)
      .find((option) => text(option) === name)!
      .click();
    await fixture.whenStable();
  }
  /** The printing the picker shows, by its image's name. */
  const shownPrinting = () => namedImages(openDialog()!)[0].getAttribute('alt');
  const shownImage = () => namedImages(openDialog()!)[0].getAttribute('src');
  /** Every stacked Island's image. */
  const islandImages = (plan: HTMLElement) =>
    [...namedList(plan, 'Lands').querySelectorAll('img')].map((img) => img.getAttribute('src'));

  it('opens from a basic land in stacks mode and in list mode, named for its land', async () => {
    const { fixture, plan } = await openWith();

    const dialog = await openPicker(fixture, plan);
    expect(heading(dialog, 'Island printing')).toBeDefined();
    button(dialog, 'Cancel')!.click();
    await fixture.whenStable();
    expect(openDialog()).toBeNull();

    button(plan, 'List')!.click();
    await fixture.whenStable();
    const name = [...plan.querySelectorAll<HTMLElement>('li .name')].find(
      (n) => text(n) === 'Island',
    )!;
    expect(name.getAttribute('aria-haspopup')).toBe('dialog');
    name.click();
    await fixture.whenStable();
    expect(heading(openDialog()!, 'Island printing')).toBeDefined();
    // The printings are kept from the first opening.
    http.expectNone(islandRequest);
    // Only the images come from Scryfall, from its CDN.
    expect(http.match((req) => req.url.startsWith('https://api.scryfall.com/'))).toEqual([]);
  });

  it('opens on the set of the printing shown, every set listed as the API orders them, and steps through its printings, wrapping', async () => {
    const { fixture, plan } = await openWith();
    const dialog = await openPicker(fixture, plan);

    expect(setField()!.value).toBe('Onslaught · ONS');
    expect(setOptions()).toEqual([]);
    openSets();
    expect(setOptions()).toEqual([
      'Kaldheim · KHM',
      'Core Set 2021 · M21',
      'Dragons of Tarkir · DTK',
      'Onslaught · ONS',
    ]);
    pressEscape();
    expect(shownPrinting()).toBe('Island, ONS #335');
    expect(text(dialog)).toContain('ONS #335');
    expect(shownImage()).toBe(cdn('large', ONS_335));

    button(dialog, 'Next printing')!.click();
    await fixture.whenStable();
    expect(shownPrinting()).toBe('Island, ONS #336');
    button(dialog, 'Next printing')!.click();
    await fixture.whenStable();
    expect(shownPrinting()).toBe('Island, ONS #335');
    button(dialog, 'Previous printing')!.click();
    await fixture.whenStable();
    expect(shownPrinting()).toBe('Island, ONS #336');

    await chooseSet(fixture, 'Core Set 2021 · M21');
    expect(shownPrinting()).toBe('Island, M21 #250');
    expect(button(dialog, 'Next printing')).toBeUndefined();
    expect(button(dialog, 'Previous printing')).toBeUndefined();

    await chooseSet(fixture, 'Kaldheim · KHM');
    expect(shownPrinting()).toBe('Island, KHM #394');
    for (const number of ['395', '396', '394']) {
      button(dialog, 'Next printing')!.click();
      await fixture.whenStable();
      expect(shownPrinting()).toBe(`Island, KHM #${number}`);
    }
  });

  it('narrows the sets to those whose code or name holds what is typed, a set with that very code first', async () => {
    const { fixture, plan } = await openWith();
    await openPicker(fixture, plan);
    openSets();

    typeInto(setField()!, 'kald');
    expect(setOptions()).toEqual(['Kaldheim · KHM']);
    typeInto(setField()!, 'M21');
    expect(setOptions()).toEqual(['Core Set 2021 · M21']);
    // Dragons of Tarkir is newer, but Onslaught's code is what was typed.
    typeInto(setField()!, 'ONS');
    expect(setOptions()).toEqual(['Onslaught · ONS', 'Dragons of Tarkir · DTK']);
    typeInto(setField()!, 'o');
    expect(setOptions()).toEqual([
      'Core Set 2021 · M21',
      'Dragons of Tarkir · DTK',
      'Onslaught · ONS',
    ]);
  });

  it('chooses the highlighted set on Enter, showing its first printing, while arrowing changes nothing', async () => {
    const { fixture, plan } = await openWith();
    const dialog = await openPicker(fixture, plan);
    openSets();
    typeInto(setField()!, 'k');
    expect(highlightedOption(setField()!)).toBe('Kaldheim · KHM');

    pressKey(setField()!, 'ArrowDown');
    expect(highlightedOption(setField()!)).toBe('Dragons of Tarkir · DTK');
    pressKey(setField()!, 'ArrowUp');
    expect(highlightedOption(setField()!)).toBe('Kaldheim · KHM');
    expect(shownPrinting()).toBe('Island, ONS #335');

    pressKey(setField()!, 'Enter');
    await fixture.whenStable();
    expect(openDialog()).toBe(dialog);
    expect(shownPrinting()).toBe('Island, KHM #394');
    expect(text(dialog)).toContain('1 of 3');
    expect(setField()!.value).toBe('Kaldheim · KHM');
    expect(setOptions()).toEqual([]);
  });

  it('opens the full list on the chosen set, its text selected so typing replaces it', async () => {
    const { fixture, plan } = await openWith();
    await openPicker(fixture, plan);

    openSets();

    const field = setField()!;
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Onslaught · ONS'.length]);
    expect(highlightedOption(field)).toBe('Onslaught · ONS');
    expect(setOptions()).toHaveLength(4);
  });

  it.each<[string, () => void]>([
    ['Escape', pressEscape],
    ['leaving the field', () => setField()!.blur()],
  ])(
    'restores the chosen set on %s without choosing, the picker staying open',
    async (_, leave) => {
      const { fixture, plan } = await openWith();
      const dialog = await openPicker(fixture, plan);
      openSets();
      typeInto(setField()!, 'kald');
      pressKey(setField()!, 'ArrowDown');

      leave();
      await fixture.whenStable();

      expect(openDialog()).toBe(dialog);
      expect(setField()!.value).toBe('Onslaught · ONS');
      expect(setOptions()).toEqual([]);
      expect(shownPrinting()).toBe('Island, ONS #335');
    },
  );

  it('closes the picker on Escape once the list is closed', async () => {
    const { fixture, plan } = await openWith();
    await openPicker(fixture, plan);
    openSets();

    pressEscape();
    await fixture.whenStable();
    expect(openDialog()).not.toBeNull();
    pressEscape();
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
  });

  it('says when no set matches, keeping the set last chosen', async () => {
    const { fixture, plan } = await openWith();
    const dialog = await openPicker(fixture, plan);
    button(dialog, 'Next printing')!.click();
    await fixture.whenStable();
    openSets();

    typeInto(setField()!, 'zzz');
    pressKey(setField()!, 'Enter');
    await fixture.whenStable();

    expect(setOptions()).toEqual([]);
    expect(comboboxStatus(setField()!)).toBe('No set matches');
    expect(shownPrinting()).toBe('Island, ONS #336');
    expect(text(dialog)).toContain('2 of 2');
    button(dialog, 'Next printing')!.click();
    await fixture.whenStable();
    expect(shownPrinting()).toBe('Island, ONS #335');
  });

  it('saves the printing shown as the preferred printing, which every copy of the land then shows', async () => {
    const { fixture, plan } = await openWith();
    const dialog = await openPicker(fixture, plan);
    await chooseSet(fixture, 'Kaldheim · KHM');
    // Browsing changes only the picker.
    expect(islandImages(plan)).toEqual([cdn('normal', ONS_335), cdn('normal', ONS_335)]);

    button(dialog, 'Use this printing')!.click();
    const saved = http.expectOne(`/api/preferred-printings/Island`);
    expect(saved.request.method).toBe('PUT');
    expect(saved.request.body).toEqual({ scryfallId: KHM_394 });
    saved.flush({ Island: khm394 });
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
    expect(islandImages(plan)).toEqual([cdn('normal', KHM_394), cdn('normal', KHM_394)]);
  });

  it('opens on the preferred printing, and Use default clears it so the land shows its default printing', async () => {
    const { fixture, plan } = await openWith(
      withIslands({ preferredPrintings: { Island: khm394 } }),
    );
    expect(islandImages(plan)).toEqual([cdn('normal', KHM_394), cdn('normal', KHM_394)]);
    const dialog = await openPicker(fixture, plan);
    expect(setField()!.value).toBe('Kaldheim · KHM');
    expect(shownPrinting()).toBe('Island, KHM #394');

    button(dialog, 'Use default')!.click();
    const cleared = http.expectOne(`/api/preferred-printings/Island`);
    expect(cleared.request.method).toBe('DELETE');
    cleared.flush({});
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
    expect(islandImages(plan)).toEqual([cdn('normal', ONS_335), cdn('normal', ONS_335)]);
  });

  it('offers Use default only once the land has a preferred printing', async () => {
    const { fixture, plan } = await openWith();
    const dialog = await openPicker(fixture, plan);

    expect(button(dialog, 'Use default')!.disabled).toBe(true);
  });

  it.each<[string, () => void]>([
    ['Cancel', () => button(openDialog()!, 'Cancel')!.click()],
    ['Escape', pressEscape],
    ['a backdrop click', clickBackdrop],
  ])('changes nothing on %s', async (_, close) => {
    const { fixture, plan } = await openWith();
    await openPicker(fixture, plan);
    await chooseSet(fixture, 'Kaldheim · KHM');

    close();
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
    expect(islandImages(plan)).toEqual([cdn('normal', ONS_335), cdn('normal', ONS_335)]);
  });

  it('says so when the printings fail to load, keeping the printing shown, and tries again', async () => {
    const { fixture, plan } = await openWith();
    stackedIsland(plan).click();

    (await vi.waitFor(() => http.expectOne(islandRequest))).flush(null, {
      status: 503,
      statusText: 'Unavailable',
    });
    await fixture.whenStable();
    const dialog = openDialog()!;
    expect(text(alertIn(dialog))).toBe('Couldn’t load the printings.');
    expect(shownPrinting()).toBe('Island, ONS #335');
    expect(setField()).toBeUndefined();

    button(dialog, 'Try again')!.click();
    (await vi.waitFor(() => http.expectOne(islandRequest))).flush(islands);
    await fixture.whenStable();

    await vi.waitFor(() => expect(setField()!.value).toBe('Onslaught · ONS'));
    expect(alertIn(dialog)).toBeNull();
  });

  it('says so while the API is still storing the printings, and tries again', async () => {
    const { fixture, plan } = await openWith();

    const dialog = await openPicker(fixture, plan, { sets: [] });

    expect(text(alertIn(dialog))).toBe('Couldn’t load the printings.');
    button(dialog, 'Try again')!.click();
    (await vi.waitFor(() => http.expectOne(islandRequest))).flush(islands);
    await fixture.whenStable();
    await vi.waitFor(() => expect(setField()!.value).toBe('Onslaught · ONS'));
  });

  it('stays open with the error when saving fails, changing nothing', async () => {
    const { fixture, plan } = await openWith();
    const dialog = await openPicker(fixture, plan);
    await chooseSet(fixture, 'Kaldheim · KHM');

    button(dialog, 'Use this printing')!.click();
    http.expectOne(`/api/preferred-printings/Island`).flush(
      {
        error: 'invalid',
        message: 'That isn’t an English printing of Island.',
      } satisfies PreferredPrintingProblem,
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect(openDialog()).toBe(dialog);
    expect(text(alertIn(dialog))).toBe('That isn’t an English printing of Island.');
    expect(shownPrinting()).toBe('Island, KHM #394');
    expect(islandImages(plan)).toEqual([cdn('normal', ONS_335), cdn('normal', ONS_335)]);
  });

  it('opens from a locked deck', async () => {
    const tournament = playing();
    const { fixture, page } = await openDraft(completeSnapshot, withTournament(tournament), {
      cards,
      plan: withIslands(),
      tournament,
    });
    const deck = await openTab(fixture, page, 'Deck');
    expect(text(deck)).toContain('Your deck is locked');

    await openPicker(fixture, deck);

    expect(heading(openDialog()!, 'Island printing')).toBeDefined();
  });

  it('falls back to Scryfall’s API image of a preferred printing when its image fails in the stacks', async () => {
    const { fixture, plan } = await openWith(
      withIslands({ preferredPrintings: { Island: khm394 } }),
    );
    const island = () => namedList(plan, 'Lands').querySelector<HTMLImageElement>('img')!;

    island().dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(island().getAttribute('src')).toBe(
      `https://api.scryfall.com/cards/${KHM_394}?format=image&version=normal`,
    );
  });
});
