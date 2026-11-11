import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import type { DebugElement } from '@angular/core';
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
  serverError,
  image,
} from './harness';
import {
  clickBackdrop,
  hiddenFromAssistiveTech,
  openDialog,
  pressEscape,
  pressTab,
  question,
  text,
} from '../../specs-harness';
import { useTallScreen, shivan } from './pool-tab-harness';
import {
  bobsTurn,
  bolt,
  apiImage,
  defaultPrintings,
  openPlan,
  planBoards,
  planned,
  stack,
  stacksOf,
  zenMountain,
} from './plan-tab-harness';
import { playing, withTournament } from './play-tab-harness';

useDraftsApp();
useTallScreen();

describe('basic lands on the plan tab', () => {
  /** The API request that sets how many Islands the plan holds. */
  const setIslandUrl = '/api/drafts/draft-1/plan/basics/Island';
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
    readyNotice: false,
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

  // First in the file: Stryker credits module-level code, such as the default printings, only to each spec file's first test.
  it('shows each basic land’s default printing in the Lands stack, offering its small and normal images', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    // By name, as the stack sorts them.
    const lands = ['Forest', 'Island', 'Mountain', 'Plains', 'Swamp'] as const;
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(
        lands.map((land) => ({ land, board: 'Mainboard' as const, count: 1 })),
      ),
    });
    const plan = await openPlan(fixture, page);

    expect(stack(plan, 'Lands')).toEqual(lands);
    expect(
      namedImages(namedList(plan, 'Lands')).map((img) => [
        img.alt,
        img.getAttribute('src'),
        img.getAttribute('srcset'),
      ]),
    ).toEqual(
      lands.map((land) => {
        const { id } = defaultPrintings[land];
        return [
          land,
          image('normal', id),
          `${image('small', id)} 160w, ${image('normal', id)} 488w`,
        ];
      }),
    );
  });

  it('adds and removes each basic with − and +, and by typing a number, on the mainboard', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);
    expect(
      ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map((land) => countOf(land).value),
    ).toEqual(['0', '0', '0', '0', '0']);
    expect(inDialog('One fewer Plains')!.disabled).toBe(true);

    inDialog('One more Plains')!.click();
    const added = http.expectOne('/api/drafts/draft-1/plan/basics/Plains');
    expect(added.request.method).toBe('PUT');
    expect(added.request.body).toEqual({ count: 1 });
    added.flush(boltAndShivanWith([{ land: 'Plains', board: 'Mainboard', count: 1 }]));
    await vi.waitFor(() => expect(countOf('Plains').value).toBe('1'));
    expect(planBoards(plan)[0]).toEqual({
      heading: 'Mainboard 3 (3 picked)',
      lines: ['1 Lightning Bolt', '1 Shivan Dragon', '1 Plains'],
    });

    typeCount('Island', '8');
    const typed = http.expectOne(setIslandUrl);
    expect(typed.request.body).toEqual({ count: 8 });
    typed.flush(
      boltAndShivanWith([
        { land: 'Plains', board: 'Mainboard', count: 1 },
        { land: 'Island', board: 'Mainboard', count: 8 },
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
    fewer.flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 8 }]));
    await vi.waitFor(() => expect(countOf('Plains').value).toBe('0'));

    typeCount('Island', '0');
    http.expectOne(setIslandUrl).flush(boltAndShivanWith([]));
    await vi.waitFor(() =>
      expect(planBoards(plan)[0].lines).toEqual(['1 Lightning Bolt', '1 Shivan Dragon']),
    );
  });

  it('puts back a typed number that isn’t one, and keeps a typed number within 0 to 99', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Swamp', board: 'Mainboard', count: 2 }]),
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
      .expectOne(setIslandUrl)
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

  it('puts back a count typed while another change is in flight, sending nothing', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    inDialog('One more Plains')!.click();
    typeCount('Island', '8');

    await vi.waitFor(() => expect(countOf('Island').value).toBe('0'));
    http.expectNone(setIslandUrl);
    http
      .expectOne('/api/drafts/draft-1/plan/basics/Plains')
      .flush(boltAndShivanWith([{ land: 'Plains', board: 'Mainboard', count: 1 }]));
    await vi.waitFor(() => expect(countOf('Plains').value).toBe('1'));
  });

  it('clears every basic', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([
        { land: 'Mountain', board: 'Mainboard', count: 5 },
        { land: 'Forest', board: 'Mainboard', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    inDialog('Clear basics')!.click();
    const cleared = http.expectOne('/api/drafts/draft-1/plan/basics');
    expect(cleared.request.method).toBe('DELETE');
    cleared.flush(boltAndShivanWith());

    await vi.waitFor(() => expect(countOf('Mountain').value).toBe('0'));
    expect(countOf('Forest').value).toBe('0');
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

    inDialog('One more Forest')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Forest');
  });

  it('shows basics in the Lands stack on desktop, with their card images', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 2 }]),
    });
    const plan = await openPlan(fixture, page);

    expect(stack(plan, 'Lands')).toEqual(['Island', 'Island']);
    expect(namedImages(namedList(plan, 'Lands'))[0].getAttribute('src')).toBe(
      'https://cards.scryfall.io/normal/front/3/6/36e062ec-df51-40c0-ad8a-2ee1cb8f8f17.jpg',
    );
  });

  it('falls back to Scryfall’s API image of a basic land’s default printing when its image fails in the stacks', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 1 }]),
    });
    const plan = await openPlan(fixture, page);
    const island = () => plan.querySelector<HTMLImageElement>('img[alt="Island"]')!;

    island().dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(island().getAttribute('src')).toBe(apiImage('normal', defaultPrintings.Island.id));
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
    // Named by its heading.
    expect(await question('Basic lands')).toBe(dialog);
    const symbols = namedImages(dialog);
    expect(symbols.map((symbol) => [symbol.getAttribute('src'), symbol.alt, symbol.title])).toEqual(
      [
        ['mana/W.svg', 'Plains', 'Plains'],
        ['mana/U.svg', 'Island', 'Island'],
        ['mana/B.svg', 'Swamp', 'Swamp'],
        ['mana/R.svg', 'Mountain', 'Mountain'],
        ['mana/G.svg', 'Forest', 'Forest'],
      ],
    );
    // Each number is labelled by its land, through its symbol's alt text.
    expect(countOf('Forest')).toBeDefined();
    // Wastes is no basic land: a pool can hold it as a card.
    expect(button(dialog, 'One more Wastes')).toBeUndefined();
    expect(button(dialog, 'Clear basics')).toBeDefined();
    expect(button(dialog, 'Done')).toBeDefined();
  });

  it('counts the plan’s basics on the button, and only when it holds some', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([
        { land: 'Mountain', board: 'Mainboard', count: 5 },
        { land: 'Forest', board: 'Mainboard', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands (6)');

    const dialog = await openBasics(fixture, plan);
    button(dialog, 'One more Forest')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Forest').flush(
      boltAndShivanWith([
        { land: 'Mountain', board: 'Mainboard', count: 5 },
        { land: 'Forest', board: 'Mainboard', count: 2 },
      ]),
    );
    // The plan behind the dialog updates as each change saves.
    await vi.waitFor(() => expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands (7)'));
    expect(planBoards(plan)[0].lines).toContain('2 Forest');

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

  it('offers the Basic lands button and the mode, in list mode, on mobile', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);

    expect(button(plan, 'Basic lands')).toBeDefined();
    expect(groupButtons(plan, 'Mode')).toEqual(['Stacks', 'List']);
    expect(group(plan, 'Group by')).toBeNull();
  });

  it('shows no Wastes among the basic lands, in the Lands stack or in the list', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    const dialog = await openBasics(fixture, plan);
    // One of each basic land the dialog offers.
    const offered: PlannedBasicView[] = [];
    for (const land of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] as const) {
      button(dialog, `One more ${land}`)!.click();
      offered.push({ land, board: 'Mainboard', count: 1 });
      http.expectOne(`/api/drafts/draft-1/plan/basics/${land}`).flush(boltAndShivanWith(offered));
      await vi.waitFor(() => expect(countOf(land).value).toBe('1'));
    }
    inDialog('Done')!.click();
    await fixture.whenStable();

    expect(stack(plan, 'Lands')).toEqual(['Forest', 'Island', 'Mountain', 'Plains', 'Swamp']);
    button(plan, 'List')!.click();
    await fixture.whenStable();
    const lines = planBoards(plan)[0].lines;
    expect(lines).toContain('1 Forest');
    expect(lines.some((line) => line.includes('Wastes'))).toBe(false);
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
      .expectOne(setIslandUrl)
      .flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 1 }]));
    await vi.waitFor(() => expect(more.getAttribute('aria-disabled')).toBeNull());
    expect(document.activeElement).toBe(more);

    more.click();
    const second = http.expectOne(setIslandUrl);
    expect(second.request.body).toEqual({ count: 2 });
    second.flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 2 }]));
    await vi.waitFor(() => expect(countOf('Island').value).toBe('2'));
    expect(document.activeElement).toBe(more);
  });

  it('moves focus to + once − takes a basic to none', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 1 }]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    inDialog('One fewer Island')!.focus();
    inDialog('One fewer Island')!.click();
    http.expectOne(setIslandUrl).flush(boltAndShivanWith());

    await vi.waitFor(() => expect(document.activeElement).toBe(inDialog('One more Island')));
  });

  it('moves focus to − once + takes a basic to 99, not on to the next land', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 98 }]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    inDialog('One more Island')!.focus();
    inDialog('One more Island')!.click();
    http
      .expectOne(setIslandUrl)
      .flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 99 }]));

    await vi.waitFor(() => expect(document.activeElement).toBe(inDialog('One fewer Island')));
  });

  it('moves focus from a typed count to −, after a higher count, or to +, after a lower one', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    countOf('Island').focus();
    typeCount('Island', '8');
    // The number is disabled while its change is sent.
    await fixture.whenStable();
    expect(countOf('Island').disabled).toBe(true);
    http
      .expectOne(setIslandUrl)
      .flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 8 }]));
    await vi.waitFor(() => expect(document.activeElement).toBe(inDialog('One fewer Island')));

    countOf('Island').focus();
    typeCount('Island', '2');
    http
      .expectOne(setIslandUrl)
      .flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 2 }]));
    await vi.waitFor(() => expect(document.activeElement).toBe(inDialog('One more Island')));
  });

  it('sends nothing for a typed count the plan already holds, or one kept within 99 to it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([
        { land: 'Swamp', board: 'Mainboard', count: 2 },
        { land: 'Forest', board: 'Mainboard', count: 99 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    typeCount('Swamp', '2');
    typeCount('Forest', '250');
    await fixture.whenStable();

    http.expectNone((req) => req.url.startsWith('/api/drafts/draft-1/plan/basics'));
    expect(countOf('Forest').value).toBe('99');
  });

  it('says when a change fails, and takes the error away once a later change is made', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    const dialog = await openBasics(fixture, plan);

    inDialog('One more Island')!.click();
    http.expectOne(setIslandUrl).flush(null, serverError);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(boltAndShivanWith());
    await vi.waitFor(() =>
      expect(text(alertIn(dialog))).toBe("Couldn't change your plan. Try again in a moment."),
    );

    inDialog('One more Island')!.click();
    http
      .expectOne(setIslandUrl)
      .flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 1 }]));
    await vi.waitFor(() => expect(countOf('Island').value).toBe('1'));
    expect(alertIn(dialog)).toBeNull();
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

  describe('moving a basic land between plan boards', () => {
    /** The API request that moves one copy of `land` to a plan board. */
    const moveUrl = (land: string) => `/api/drafts/draft-1/plan/basics/${land}`;

    /** Each of the Plan tab's drop lists, the mainboard's then the sideboard's. The Queue tab has one of its own. */
    const dropLists = (fixture: AppFixture) =>
      fixture.debugElement.query(By.css('app-plan-tab')).queryAll(By.directive(CdkDropList));
    /** The drags in `list` whose card image is `alt`. */
    const dragsOf = (list: DebugElement, alt: string) =>
      list
        .queryAll(By.directive(CdkDrag))
        .filter((drag) => drag.nativeElement.querySelector('img')?.alt === alt)
        .map((drag) => drag.injector.get(CdkDrag));

    it('moves one copy from its line to the sideboard and back in list mode, each plan board listing its own basics', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 3 }]),
      });
      const plan = await openPlan(fixture, page);

      button(plan, 'Move Island to the sideboard')!.click();
      const moved = http.expectOne(moveUrl('Island'));
      expect(moved.request.method).toBe('PUT');
      expect(moved.request.body).toEqual({ board: 'Sideboard' });
      moved.flush(
        boltAndShivanWith([
          { land: 'Island', board: 'Mainboard', count: 2 },
          { land: 'Island', board: 'Sideboard', count: 1 },
        ]),
      );
      await vi.waitFor(() =>
        expect(planBoards(plan)).toEqual([
          {
            heading: 'Mainboard 4 (4 picked)',
            lines: ['1 Lightning Bolt', '1 Shivan Dragon', '2 Island'],
          },
          { heading: 'Sideboard 1 (1 picked)', lines: ['1 Island'] },
        ]),
      );

      button(plan, 'Move Island to the mainboard')!.click();
      const back = http.expectOne(moveUrl('Island'));
      expect(back.request.method).toBe('PUT');
      expect(back.request.body).toEqual({ board: 'Mainboard' });
      back.flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 3 }]));
      await vi.waitFor(() =>
        expect(planBoards(plan)[1]).toEqual({ heading: 'Sideboard 0 (0 picked)', lines: [] }),
      );
    });

    it('drags a basic land’s copy from its line onto the other plan board on desktop', async () => {
      viewOn('desktop');
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: boltAndShivanWith([{ land: 'Forest', board: 'Sideboard', count: 2 }]),
      });
      const plan = await openPlan(fixture, page);
      button(plan, 'List')!.click();
      await fixture.whenStable();
      const [mainboard, sideboard] = dropLists(fixture);
      const forest = sideboard
        .queryAll(By.directive(CdkDrag))
        .find((drag) => drag.nativeElement.textContent?.includes('Forest'))!
        .injector.get(CdkDrag);
      expect(forest.disabled).toBe(false);

      mainboard.triggerEventHandler('cdkDropListDropped', {
        item: forest,
        previousContainer: sideboard.injector.get(CdkDropList),
        container: mainboard.injector.get(CdkDropList),
      });
      await fixture.whenStable();

      const moved = http.expectOne(moveUrl('Forest'));
      expect(moved.request.body).toEqual({ board: 'Mainboard' });
    });

    it('moves a stacked copy by its move button, focus following it, and by a drag, the sideboard’s basics in its one stack after its other cards', async () => {
      viewOn('desktop');
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: boltAndShivanWith(
          [
            { land: 'Island', board: 'Mainboard', count: 1 },
            { land: 'Forest', board: 'Sideboard', count: 1 },
          ],
          { mainboard: [planned(shivan)], sideboard: [planned(bolt)] },
        ),
      });
      const plan = await openPlan(fixture, page);

      button(plan, 'Move Island to the sideboard')!.focus();
      button(plan, 'Move Island to the sideboard')!.click();
      const moved = http.expectOne(moveUrl('Island'));
      expect(moved.request.body).toEqual({ board: 'Sideboard' });
      moved.flush(
        boltAndShivanWith(
          [
            { land: 'Forest', board: 'Sideboard', count: 1 },
            { land: 'Island', board: 'Sideboard', count: 1 },
          ],
          { mainboard: [planned(shivan)], sideboard: [planned(bolt)] },
        ),
      );
      await vi.waitFor(() =>
        expect(stack(plan, 'Sideboard')).toEqual(['Lightning Bolt', 'Forest', 'Island']),
      );
      expect(stacksOf(plan)[0]).toEqual(['6: Shivan Dragon']);
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(plan, 'Move Island to the mainboard')),
      );

      const [mainboard, sideboard] = dropLists(fixture);
      const [forest] = dragsOf(sideboard, 'Forest');
      expect(forest.disabled).toBe(false);
      mainboard.triggerEventHandler('cdkDropListDropped', {
        item: forest,
        previousContainer: sideboard.injector.get(CdkDropList),
        container: mainboard.injector.get(CdkDropList),
      });
      await fixture.whenStable();

      const dragged = http.expectOne(moveUrl('Forest'));
      expect(dragged.request.method).toBe('PUT');
      expect(dragged.request.body).toEqual({ board: 'Mainboard' });
    });

    it('shows every copy of a basic land in the same printing on both plan boards', async () => {
      viewOn('desktop');
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: boltAndShivanWith(
          [
            { land: 'Mountain', board: 'Mainboard', count: 1 },
            { land: 'Mountain', board: 'Sideboard', count: 2 },
          ],
          { preferredPrintings: { Mountain: zenMountain } },
        ),
      });
      const plan = await openPlan(fixture, page);

      expect(
        [namedList(plan, 'Lands'), namedList(plan, 'Sideboard')].flatMap((list) =>
          namedImages(list).map((img) => img.getAttribute('src')),
        ),
      ).toEqual(Array(3).fill(zenMountain.images.normal));
    });

    it('offers no move button and no drag for a basic land on a locked deck, in either mode', async () => {
      viewOn('desktop');
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });
      const { fixture, page } = await openDraft(completeSnapshot, withTournament(playing()), {
        cards,
        plan: boltAndShivanWith([
          { land: 'Island', board: 'Mainboard', count: 1 },
          { land: 'Island', board: 'Sideboard', count: 1 },
        ]),
        tournament: playing(),
      });
      const plan = await openPlan(fixture, page);

      for (const mode of ['Stacks', 'List']) {
        button(plan, mode)!.click();
        await fixture.whenStable();
        expect(button(plan, 'Move Island to the sideboard')).toBeUndefined();
        expect(button(plan, 'Move Island to the mainboard')).toBeUndefined();
        expect(dropLists(fixture).map((list) => list.injector.get(CdkDropList).disabled)).toEqual([
          true,
          true,
        ]);
      }
    });
  });
});
