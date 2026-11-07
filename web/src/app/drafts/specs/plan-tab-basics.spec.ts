import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import type { PlannedBasicView, PlanView } from 'contract';
import {
  useDraftsApp,
  http,
  openDraft,
  completeSnapshot,
  alertIn,
  button,
  controlByLabel,
  group,
  heading,
  namedImages,
  namedList,
  viewOn,
  type AppFixture,
  drafting,
  router,
  openTab,
} from './harness';
import {
  clickBackdrop,
  hiddenFromAssistiveTech,
  openDialog,
  pressEscape,
  pressTab,
  text,
} from '../../specs-harness';
import { useTallScreen, shivan } from './pool-tab-harness';
import {
  bobsTurn,
  bolt,
  openPlan,
  planBoards,
  planned,
  printingSearch,
  stack,
} from './plan-tab-harness';
import { playing, withTournament } from './play-tab-harness';

useDraftsApp();
useTallScreen();

describe('basic lands on the plan tab', () => {
  const cards = [shivan, bolt];
  /** Lightning Bolt and Shivan Dragon picked on the mainboard, and `basics`. */
  const boltAndShivanWith = (
    basics: PlannedBasicView[] = [],
    fields: Partial<PlanView> = {},
  ): PlanView => ({
    mainboard: [planned(bolt), planned(shivan)],
    sideboard: [],
    basics,
    lost: [],
    preferredPrintings: {},
    ...fields,
  });

  /** The Basic lands button, whatever count it shows. */
  const basicsButton = (plan: HTMLElement) =>
    [...plan.querySelectorAll('button')].find((b) =>
      b.textContent?.trim().startsWith('Basic lands'),
    );
  /** Opens the Basic lands dialog, and answers with it. */
  async function openBasics(fixture: AppFixture, plan: HTMLElement) {
    basicsButton(plan)!.click();
    await fixture.whenStable();
    return openDialog()!;
  }
  /** A button in the open dialog, by its text or aria-label. */
  const inDialog = (label: string) => button(openDialog()!, label);

  /** The Basic lands control's number for `land`, labelled by the land, if the dialog is open. */
  const countOf = (land: string) => controlByLabel(document.body, 'spinbutton', land)!;
  /** Types `value` into the number for `land`, as a player does before leaving it. */
  function typeCount(land: string, value: string) {
    const input = countOf(land);
    input.value = value;
    input.dispatchEvent(new Event('change'));
  }

  it('adds and removes each basic with − and +, and by typing a number, on the mainboard', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);
    expect(
      ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'].map(
        (land) => countOf(land).value,
      ),
    ).toEqual(['0', '0', '0', '0', '0', '0']);
    expect(inDialog('One fewer Plains')!.disabled).toBe(true);

    inDialog('One more Plains')!.click();
    const added = http.expectOne('/api/drafts/draft-1/plan/basics/Plains');
    expect(added.request.method).toBe('PUT');
    expect(added.request.body).toEqual({ count: 1 });
    added.flush(boltAndShivanWith([{ land: 'Plains', count: 1 }]));
    await vi.waitFor(() => expect(countOf('Plains').value).toBe('1'));
    expect(planBoards(plan)[0]).toEqual({
      heading: 'Mainboard 3 (3 picked)',
      lines: ['1 Lightning Bolt', '1 Shivan Dragon', '1 Plains'],
    });

    typeCount('Island', '8');
    const typed = http.expectOne('/api/drafts/draft-1/plan/basics/Island');
    expect(typed.request.body).toEqual({ count: 8 });
    typed.flush(
      boltAndShivanWith([
        { land: 'Plains', count: 1 },
        { land: 'Island', count: 8 },
      ]),
    );
    await vi.waitFor(() =>
      expect(planBoards(plan)[0].lines).toEqual([
        '1 Lightning Bolt',
        '1 Shivan Dragon',
        '1 Plains',
        '8 Island',
      ]),
    );

    inDialog('One fewer Plains')!.click();
    const fewer = http.expectOne('/api/drafts/draft-1/plan/basics/Plains');
    expect(fewer.request.body).toEqual({ count: 0 });
    fewer.flush(boltAndShivanWith([{ land: 'Island', count: 8 }]));
    await vi.waitFor(() => expect(countOf('Plains').value).toBe('0'));

    typeCount('Island', '0');
    http.expectOne('/api/drafts/draft-1/plan/basics/Island').flush(boltAndShivanWith([]));
    await vi.waitFor(() =>
      expect(planBoards(plan)[0].lines).toEqual(['1 Lightning Bolt', '1 Shivan Dragon']),
    );
  });

  it('puts back a typed number that isn’t one, and keeps a typed number within 0 to 99', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Swamp', count: 2 }]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    typeCount('Swamp', '');
    expect(countOf('Swamp').value).toBe('2');
    http.expectNone('/api/drafts/draft-1/plan/basics/Swamp');

    typeCount('Swamp', '250');
    expect(http.expectOne('/api/drafts/draft-1/plan/basics/Swamp').request.body).toEqual({
      count: 99,
    });
  });

  it('puts back a typed count the api refuses', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    typeCount('Island', '8');
    http
      .expectOne('/api/drafts/draft-1/plan/basics/Island')
      .flush(
        { error: 'draft-not-open', message: 'This draft isn’t open.' },
        { status: 409, statusText: 'Conflict' },
      );
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    reread.flush(boltAndShivanWith());
    await fixture.whenStable();

    await vi.waitFor(() => expect(countOf('Island').value).toBe('0'));
    expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands');
    // Said in the dialog, as the page behind it is hidden from assistive technology.
    expect(alertIn(openDialog()!)?.textContent).toContain('This draft isn’t open.');
  });

  it('keeps basics on the mainboard, with nothing to move or remove them by but their count', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Forest', count: 3 }]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    expect(planBoards(plan)).toEqual([
      {
        heading: 'Mainboard 5 (5 picked)',
        lines: ['1 Lightning Bolt', '1 Shivan Dragon', '3 Forest'],
      },
      { heading: 'Sideboard 0 (0 picked)', lines: [] },
    ]);
    expect(countOf('Forest').value).toBe('3');
    expect(button(plan, 'Move Forest to the sideboard')).toBeUndefined();
    expect(button(plan, 'Remove Forest from your plan')).toBeUndefined();
    expect(button(plan, 'Move Shivan Dragon to the sideboard')).toBeDefined();
  });

  it('clears every basic', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([
        { land: 'Mountain', count: 5 },
        { land: 'Wastes', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    inDialog('Clear basics')!.click();
    const cleared = http.expectOne('/api/drafts/draft-1/plan/basics');
    expect(cleared.request.method).toBe('DELETE');
    cleared.flush(boltAndShivanWith());

    await vi.waitFor(() => expect(countOf('Mountain').value).toBe('0'));
    expect(countOf('Wastes').value).toBe('0');
    expect(planBoards(plan)[0].lines).toEqual(['1 Lightning Bolt', '1 Shivan Dragon']);
    expect(inDialog('Clear basics')!.disabled).toBe(true);
  });

  it('can change basics once the draft is complete', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Complete', turn: null }),
      { cards, plan: boltAndShivanWith() },
    );
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    inDialog('One more Wastes')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Wastes');
  });

  it('shows basics in the Lands stack on desktop, with their card images, and can’t be dragged off the mainboard', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Island', count: 2 }]),
    });
    const plan = await openPlan(fixture, page);

    expect(stack(plan, 'Lands')).toEqual(['Island', 'Island']);
    expect(namedImages(namedList(plan, 'Lands'))[0].getAttribute('src')).toBe(
      'https://cards.scryfall.io/normal/front/3/6/36e062ec-df51-40c0-ad8a-2ee1cb8f8f17.jpg',
    );

    // The Queue tab has a drop list of its own.
    const [mainboard] = fixture.debugElement
      .query(By.css('app-plan-tab'))
      .queryAll(By.directive(CdkDropList));
    const drags = mainboard.queryAll(By.directive(CdkDrag));
    const disabled = (alt: string) =>
      drags
        .filter((drag) => drag.nativeElement.querySelector('img')?.alt === alt)
        .map((drag) => drag.injector.get(CdkDrag).disabled);
    expect(disabled('Island')).toEqual([true, true]);
    expect(disabled('Shivan Dragon')).toEqual([false]);
    expect(button(plan, 'Move Island to the sideboard')).toBeUndefined();
  });

  it('falls back to Scryfall’s API image of a basic land’s default printing when its image fails in the stacks', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Island', count: 1 }]),
    });
    const plan = await openPlan(fixture, page);
    const island = () => plan.querySelector<HTMLImageElement>('img[alt="Island"]')!;

    island().dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(island().getAttribute('src')).toBe(
      'https://api.scryfall.com/cards/36e062ec-df51-40c0-ad8a-2ee1cb8f8f17?format=image&version=normal',
    );
  });

  it('sets basics in a Basic lands dialog, not above the plan boards, each labelled by its mana symbol', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    expect(countOf('Plains')).toBeUndefined();
    expect(openDialog()).toBeNull();

    const dialog = await openBasics(fixture, plan);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(heading(dialog, 'Basic lands')).toBeDefined();
    const symbols = namedImages(dialog);
    expect(symbols.map((symbol) => [symbol.getAttribute('src'), symbol.alt, symbol.title])).toEqual(
      [
        ['mana/W.svg', 'Plains', 'Plains'],
        ['mana/U.svg', 'Island', 'Island'],
        ['mana/B.svg', 'Swamp', 'Swamp'],
        ['mana/R.svg', 'Mountain', 'Mountain'],
        ['mana/G.svg', 'Forest', 'Forest'],
        ['mana/C.svg', 'Wastes', 'Wastes'],
      ],
    );
    // Each number is labelled by its land, through its symbol's alt text.
    expect(countOf('Wastes')).toBeDefined();
    expect(button(dialog, 'Clear basics')).toBeDefined();
    expect(button(dialog, 'Done')).toBeDefined();
  });

  it('counts the plan’s basics on the button, and only when it holds some', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([
        { land: 'Mountain', count: 5 },
        { land: 'Wastes', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands (6)');

    const dialog = await openBasics(fixture, plan);
    button(dialog, 'One more Wastes')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Wastes').flush(
      boltAndShivanWith([
        { land: 'Mountain', count: 5 },
        { land: 'Wastes', count: 2 },
      ]),
    );
    // The plan behind the dialog updates as each change saves.
    await vi.waitFor(() => expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands (7)'));
    expect(planBoards(plan)[0].lines).toContain('2 Wastes');

    button(dialog, 'Clear basics')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics').flush(boltAndShivanWith());
    await vi.waitFor(() => expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands'));
    expect(openDialog()).not.toBeNull();
  });

  it('closes the dialog on Done, on Escape and on a click on the backdrop', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);

    button(await openBasics(fixture, plan), 'Done')!.click();
    await fixture.whenStable();
    expect(openDialog()).toBeNull();

    await openBasics(fixture, plan);
    pressEscape();
    await fixture.whenStable();
    expect(openDialog()).toBeNull();

    // A click inside the dialog leaves it open.
    const dialog = await openBasics(fixture, plan);
    dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    dialog.click();
    await fixture.whenStable();
    expect(openDialog()).not.toBeNull();
    clickBackdrop();
    await fixture.whenStable();
    expect(openDialog()).toBeNull();
  });

  /** The buttons of the group of controls named `name`, by their text. */
  const groupButtons = (plan: HTMLElement, name: string) =>
    [...(group(plan, name)?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim());

  it('offers the Basic lands button, but no mode or grouping, on mobile', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);

    expect(button(plan, 'Basic lands')).toBeDefined();
    expect(group(plan, 'Mode')).toBeNull();
    expect(group(plan, 'Group by')).toBeNull();
  });

  it('offers the mode, the grouping in stacks mode, and the Basic lands button on desktop', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    expect(groupButtons(plan, 'Mode')).toEqual(['Stacks', 'List']);
    expect(groupButtons(plan, 'Group by')).toEqual(['Mana value', 'Color', 'Type']);
    expect(button(plan, 'Basic lands')).toBeDefined();

    button(plan, 'List')!.click();
    await fixture.whenStable();
    expect(groupButtons(plan, 'Mode')).toEqual(['Stacks', 'List']);
    expect(group(plan, 'Group by')).toBeNull();
    expect(button(plan, 'Basic lands')).toBeDefined();
  });

  it('adds two basics with + pressed twice in a row, focus staying on +', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);
    const more = inDialog('One more Island')!;

    more.focus();
    more.click();
    await fixture.whenStable();
    expect(more.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(more);
    http
      .expectOne('/api/drafts/draft-1/plan/basics/Island')
      .flush(boltAndShivanWith([{ land: 'Island', count: 1 }]));
    await vi.waitFor(() => expect(more.getAttribute('aria-disabled')).toBeNull());
    expect(document.activeElement).toBe(more);

    more.click();
    const second = http.expectOne('/api/drafts/draft-1/plan/basics/Island');
    expect(second.request.body).toEqual({ count: 2 });
    second.flush(boltAndShivanWith([{ land: 'Island', count: 2 }]));
    await vi.waitFor(() => expect(countOf('Island').value).toBe('2'));
    expect(document.activeElement).toBe(more);
  });

  it('moves focus to + once − takes a basic to none', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Island', count: 1 }]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    inDialog('One fewer Island')!.focus();
    inDialog('One fewer Island')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Island').flush(boltAndShivanWith());

    await vi.waitFor(() => expect(document.activeElement).toBe(inDialog('One more Island')));
  });

  it('opens on Done, and keeps Tab and Shift+Tab inside the dialog, wrapping at either end', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);
    await vi.waitFor(() => expect(document.activeElement).toBe(inDialog('Done')));

    // With no basics, − and Clear basics are disabled: Plains's number is the first control.
    pressTab();
    expect(document.activeElement).toBe(countOf('Plains'));
    pressTab({ shift: true });
    expect(document.activeElement).toBe(inDialog('Done'));
  });

  it('hides the page behind the dialog from assistive technology while it is open', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    const dialog = await openBasics(fixture, plan);

    await vi.waitFor(() => expect(hiddenFromAssistiveTech(basicsButton(plan)!)).toBe(true));
    expect(hiddenFromAssistiveTech(dialog)).toBe(false);

    inDialog('Done')!.click();
    await fixture.whenStable();
    expect(hiddenFromAssistiveTech(basicsButton(plan)!)).toBe(false);
  });

  it.each<[string, () => void]>([
    ['Done', () => inDialog('Done')!.click()],
    ['Escape', pressEscape],
    ['a backdrop click', clickBackdrop],
  ])('returns focus to the Basic lands button on %s', async (_, close) => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    basicsButton(plan)!.focus();
    await openBasics(fixture, plan);
    await vi.waitFor(() => expect(document.activeElement).toBe(inDialog('Done')));

    close();
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
    expect(document.activeElement).toBe(basicsButton(plan));
  });

  it('closes with the page it was opened from', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    await openBasics(fixture, await openPlan(fixture, page));

    await router.navigateByUrl('/');
    (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
  });
});

describe('the Printing picker', () => {
  const cards = [shivan, bolt];
  /** The Scryfall search the picker sends for every English printing of Island. */
  const islandSearch = printingSearch('Island');
  const ONS_335 = '36e062ec-df51-40c0-ad8a-2ee1cb8f8f17';
  const KHM_394 = 'a0000000-0000-4000-8000-000000000394';
  const cdn = (version: string, id: string) =>
    `https://cards.scryfall.io/${version}/front/${id[0]}/${id[1]}/${id}.jpg`;
  /** An English Island printing as Scryfall's search answers with it. */
  const printing = (
    id: string,
    set: string,
    setName: string,
    number: string,
    released: string,
  ) => ({
    object: 'card',
    id,
    name: 'Island',
    lang: 'en',
    set,
    set_name: setName,
    collector_number: number,
    released_at: released,
    image_uris: { small: cdn('small', id), normal: cdn('normal', id), large: cdn('large', id) },
  });
  // Kaldheim's three, Core Set 2021's one and Onslaught's two, out of order.
  const islands = [
    printing('a0000000-0000-4000-8000-000000000395', 'khm', 'Kaldheim', '395', '2021-02-05'),
    printing('b0000000-0000-4000-8000-000000000336', 'ons', 'Onslaught', '336', '2002-10-07'),
    printing(KHM_394, 'khm', 'Kaldheim', '394', '2021-02-05'),
    printing('c0000000-0000-4000-8000-000000000250', 'm21', 'Core Set 2021', '250', '2020-07-03'),
    printing(ONS_335, 'ons', 'Onslaught', '335', '2002-10-07'),
    printing('a0000000-0000-4000-8000-000000000396', 'khm', 'Kaldheim', '396', '2021-02-05'),
  ];
  const searchPage = (data: unknown[], nextPage?: string) => ({
    object: 'list',
    has_more: !!nextPage,
    ...(nextPage ? { next_page: nextPage } : {}),
    data,
  });
  /** Kaldheim's #394 as the API stores a preferred printing. */
  const khm394 = {
    scryfallId: KHM_394,
    set: 'khm',
    collectorNumber: '394',
    images: islands[2].image_uris,
  };
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
  /** Opens the picker from the first stacked Island, and answers its search with `data`. The page is stable once it is answered. */
  async function openPicker(fixture: AppFixture, plan: HTMLElement, data: unknown[] = islands) {
    stackedIsland(plan).click();
    (await vi.waitFor(() => http.expectOne(islandSearch))).flush(searchPage(data));
    await fixture.whenStable();
    return openDialog()!;
  }
  /** The set dropdown in the open picker. */
  const setChoice = () => controlByLabel(openDialog()!, 'combobox', 'Set')!;
  /** Chooses the set the dropdown names `name`. */
  async function chooseSet(fixture: AppFixture, name: string) {
    const select = setChoice();
    select.value = [...select.options].find((option) => option.text.trim() === name)!.value;
    select.dispatchEvent(new Event('change'));
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
    // The search is kept from the first opening.
    http.expectNone(islandSearch);
  });

  it('opens on the set of the printing shown, every set listed newest first, and steps through its printings in collector-number order, wrapping', async () => {
    const { fixture, plan } = await openWith();
    const dialog = await openPicker(fixture, plan);

    expect([...setChoice().options].map((option) => text(option))).toEqual([
      'Kaldheim (2021)',
      'Core Set 2021 (2020)',
      'Onslaught (2002)',
    ]);
    expect(text(setChoice().selectedOptions[0])).toBe('Onslaught (2002)');
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

    await chooseSet(fixture, 'Core Set 2021 (2020)');
    expect(shownPrinting()).toBe('Island, M21 #250');
    expect(button(dialog, 'Next printing')).toBeUndefined();
    expect(button(dialog, 'Previous printing')).toBeUndefined();

    await chooseSet(fixture, 'Kaldheim (2021)');
    expect(shownPrinting()).toBe('Island, KHM #394');
    for (const number of ['395', '396', '394']) {
      button(dialog, 'Next printing')!.click();
      await fixture.whenStable();
      expect(shownPrinting()).toBe(`Island, KHM #${number}`);
    }
  });

  it('reads every page of the search, waiting between them', async () => {
    const { fixture, plan } = await openWith();
    stackedIsland(plan).click();
    const page2 = `${islandSearch}&page=2`;

    (await vi.waitFor(() => http.expectOne(islandSearch))).flush(
      searchPage(islands.slice(0, 3), page2),
    );
    (await vi.waitFor(() => http.expectOne(page2), { timeout: 2000 })).flush(
      searchPage(islands.slice(3)),
    );
    await fixture.whenStable();

    await vi.waitFor(() => expect(setChoice().options).toHaveLength(3));
  });

  it('saves the printing shown as the preferred printing, which every copy of the land then shows', async () => {
    const { fixture, plan } = await openWith();
    const dialog = await openPicker(fixture, plan);
    await chooseSet(fixture, 'Kaldheim (2021)');
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
    expect(text(setChoice().selectedOptions[0])).toBe('Kaldheim (2021)');
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
    await chooseSet(fixture, 'Kaldheim (2021)');

    close();
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
    expect(islandImages(plan)).toEqual([cdn('normal', ONS_335), cdn('normal', ONS_335)]);
  });

  it('says so when Scryfall fails, keeping the printing shown, and tries again', async () => {
    const { fixture, plan } = await openWith();
    stackedIsland(plan).click();

    (await vi.waitFor(() => http.expectOne(islandSearch))).flush(
      { object: 'error', details: 'Down' },
      { status: 503, statusText: 'Unavailable' },
    );
    await fixture.whenStable();
    const dialog = openDialog()!;
    expect(text(alertIn(dialog))).toBe('Couldn’t load the printings from Scryfall.');
    expect(shownPrinting()).toBe('Island, ONS #335');
    expect(setChoice()).toBeUndefined();

    button(dialog, 'Try again')!.click();
    (await vi.waitFor(() => http.expectOne(islandSearch), { timeout: 2000 })).flush(
      searchPage(islands),
    );
    await fixture.whenStable();

    await vi.waitFor(() => expect(setChoice().options).toHaveLength(3));
    expect(alertIn(dialog)).toBeNull();
  });

  it('stays open with the error when saving fails, changing nothing', async () => {
    const { fixture, plan } = await openWith();
    const dialog = await openPicker(fixture, plan);
    await chooseSet(fixture, 'Kaldheim (2021)');

    button(dialog, 'Use this printing')!.click();
    http.expectOne(`/api/preferred-printings/Island`).flush(
      {
        error: 'scryfall-unavailable',
        message: 'Scryfall could not be reached. Try again in a moment.',
      },
      { status: 502, statusText: 'Bad Gateway' },
    );
    await fixture.whenStable();

    expect(openDialog()).toBe(dialog);
    expect(text(alertIn(dialog))).toBe('Scryfall could not be reached. Try again in a moment.');
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
