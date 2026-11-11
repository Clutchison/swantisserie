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
} from './plan-tab-harness';

useDraftsApp();
useTallScreen();

describe('basic lands on the plan tab', () => {
  /** The API request that adds an Island to the mainboard. */
  const addIslandUrl = '/api/drafts/draft-1/plan/basics/Island';
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

  /** The Add basics button, which opens the Basic lands dialog. */
  const basicsButton = (plan: HTMLElement) => button(plan, 'Add basics');
  /** Opens the Basic lands dialog, and answers with it. */
  async function openBasics(fixture: AppFixture, plan: HTMLElement) {
    basicsButton(plan)!.click();
    await fixture.whenStable();
    return openDialog()!;
  }
  /** A button in the open dialog, by its text or aria-label. */
  const inDialog = (label: string) => button(openDialog()!, label);
  /** The Add button for `land` in the open dialog. */
  const addOf = (land: string) => inDialog(`Add ${land}`)!;
  /** The open dialog's row for `land`: a group named by the land. */
  const row = (land: string) => group(openDialog()!, land)!;
  /** How many copies of `land` the open dialog says the mainboard holds. */
  const mainboardCount = (land: string) =>
    Number(/(\d+) on your mainboard/.exec(text(row(land)))?.[1]);
  /** The tooltip a pointer resting on `land`'s Add shows, or '' for none. */
  const tooltip = (land: string) => addOf(land).closest('[title]')?.getAttribute('title') ?? '';

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

  it('adds one copy of a basic land to the mainboard with Add, the row and the plan updating', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);
    expect(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map(mainboardCount)).toEqual([
      0, 0, 0, 0, 0,
    ]);

    addOf('Plains').click();
    const added = http.expectOne('/api/drafts/draft-1/plan/basics/Plains');
    expect(added.request.method).toBe('POST');
    expect(added.request.body).toBeNull();
    added.flush(boltAndShivanWith([{ land: 'Plains', board: 'Mainboard', count: 1 }]));

    await vi.waitFor(() => expect(mainboardCount('Plains')).toBe(1));
    expect(planBoards(plan)[0]).toEqual({
      heading: 'Mainboard 3 (3 picked)',
      lines: ['1 Lightning Bolt', '1 Shivan Dragon', '1 Plains'],
    });
  });

  it('counts only the mainboard’s copies in each row', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([
        { land: 'Island', board: 'Mainboard', count: 2 },
        { land: 'Island', board: 'Sideboard', count: 3 },
        { land: 'Forest', board: 'Sideboard', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    expect(mainboardCount('Island')).toBe(2);
    expect(mainboardCount('Forest')).toBe(0);
  });

  it('disables Add once the plan holds 99 of a land across both plan boards, its tooltip saying so', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([
        { land: 'Island', board: 'Mainboard', count: 90 },
        { land: 'Forest', board: 'Mainboard', count: 98 },
        { land: 'Island', board: 'Sideboard', count: 9 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    expect(mainboardCount('Island')).toBe(90);
    expect(addOf('Island').disabled).toBe(true);
    expect(tooltip('Island')).toBe('Your plan already holds 99 copies of Island.');
    // Said in the row too, for assistive technology, which reads no tooltip.
    expect(text(row('Island'))).toContain('Your plan already holds 99 copies of Island.');
    expect(addOf('Forest').disabled).toBe(false);
    expect(tooltip('Forest')).toBe('');
    expect(text(row('Forest'))).not.toContain('already holds');
  });

  it('shows the plan as it now is when another change landed first, saying why', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 98 }]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    addOf('Island').click();
    http
      .expectOne(addIslandUrl)
      .flush(
        { error: 'most-basics', message: 'Your plan already holds 99 copies of Island.' },
        { status: 409, statusText: 'Conflict' },
      );
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    reread.flush(
      boltAndShivanWith([
        { land: 'Island', board: 'Mainboard', count: 98 },
        { land: 'Island', board: 'Sideboard', count: 1 },
      ]),
    );

    await vi.waitFor(() => expect(addOf('Island').disabled).toBe(true));
    expect(mainboardCount('Island')).toBe(98);
    // Said in the dialog, as the page behind it is hidden from assistive technology.
    expect(text(alertIn(openDialog()!))).toBe('Your plan already holds 99 copies of Island.');
  });

  it('keeps basics on the mainboard, with nothing to move or remove them by', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Forest', board: 'Mainboard', count: 3 }]),
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
    expect(mainboardCount('Forest')).toBe(3);
    expect(button(plan, 'Move Forest to the sideboard')).toBeUndefined();
    expect(button(plan, 'Remove Forest from your plan')).toBeUndefined();
    expect(button(plan, 'Move Shivan Dragon to the sideboard')).toBeDefined();
  });

  it('clears every basic from both plan boards', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([
        { land: 'Mountain', board: 'Mainboard', count: 5 },
        { land: 'Forest', board: 'Sideboard', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    inDialog('Clear basics')!.click();
    const cleared = http.expectOne('/api/drafts/draft-1/plan/basics');
    expect(cleared.request.method).toBe('DELETE');
    cleared.flush(boltAndShivanWith());

    await vi.waitFor(() => expect(mainboardCount('Mountain')).toBe(0));
    expect(planBoards(plan)[0].lines).toEqual(['1 Lightning Bolt', '1 Shivan Dragon']);
    expect(inDialog('Clear basics')!.disabled).toBe(true);
  });

  it('offers Clear basics only while the plan holds a basic land, on either plan board', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([{ land: 'Swamp', board: 'Sideboard', count: 2 }]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    expect(mainboardCount('Swamp')).toBe(0);
    expect(inDialog('Clear basics')!.disabled).toBe(false);
  });

  it('can change basics once the draft is complete', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Complete', turn: null }),
      { cards, plan: boltAndShivanWith() },
    );
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    addOf('Forest').click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Forest');
  });

  it('shows basics in the Lands stack on desktop, with their card images, and can’t be dragged off the mainboard', async () => {
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
      plan: boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 1 }]),
    });
    const plan = await openPlan(fixture, page);
    const island = () => plan.querySelector<HTMLImageElement>('img[alt="Island"]')!;

    island().dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(island().getAttribute('src')).toBe(apiImage('normal', defaultPrintings.Island.id));
  });

  it('adds basics in a Basic lands dialog, not above the plan boards, each row showing its land’s mana symbol and name', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    expect(button(plan, 'Add Plains')).toBeUndefined();
    expect(openDialog()).toBeNull();

    const dialog = await openBasics(fixture, plan);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(heading(dialog, 'Basic lands')).toBeDefined();
    // Named by its heading.
    expect(await question('Basic lands')).toBe(dialog);
    // Each row is named by its land, so its symbol says nothing more to assistive technology.
    expect(namedImages(dialog)).toEqual([]);
    const lands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    expect(
      lands.map((land) =>
        [...row(land).querySelectorAll('img')].map((img) => img.getAttribute('src')),
      ),
    ).toEqual([['mana/W.svg'], ['mana/U.svg'], ['mana/B.svg'], ['mana/R.svg'], ['mana/G.svg']]);
    expect(lands.map((land) => text(row(land)))).toEqual(
      lands.map((land) => expect.stringContaining(land)),
    );
    // Wastes is no basic land: a pool can hold it as a card.
    expect(button(dialog, 'Add Wastes')).toBeUndefined();
    expect(button(dialog, 'Clear basics')).toBeDefined();
    expect(button(dialog, 'Done')).toBeDefined();
  });

  it('names the button Add basics, with no count, and updates the plan behind the dialog as each change saves', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith([
        { land: 'Mountain', board: 'Mainboard', count: 5 },
        { land: 'Forest', board: 'Mainboard', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    expect(text(basicsButton(plan))).toBe('Add basics');

    const dialog = await openBasics(fixture, plan);
    addOf('Forest').click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Forest').flush(
      boltAndShivanWith([
        { land: 'Mountain', board: 'Mainboard', count: 5 },
        { land: 'Forest', board: 'Mainboard', count: 2 },
      ]),
    );
    await vi.waitFor(() => expect(planBoards(plan)[0].lines).toContain('2 Forest'));
    expect(text(basicsButton(plan))).toBe('Add basics');

    button(dialog, 'Clear basics')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics').flush(boltAndShivanWith());
    await vi.waitFor(() =>
      expect(planBoards(plan)[0].lines).toEqual(['1 Lightning Bolt', '1 Shivan Dragon']),
    );
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

  it('offers the Add basics button and the mode, in list mode, on mobile', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);

    expect(basicsButton(plan)).toBeDefined();
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
      button(dialog, `Add ${land}`)!.click();
      offered.push({ land, board: 'Mainboard', count: 1 });
      http.expectOne(`/api/drafts/draft-1/plan/basics/${land}`).flush(boltAndShivanWith(offered));
      await vi.waitFor(() => expect(mainboardCount(land)).toBe(1));
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

  it('offers the mode, the grouping in stacks mode, and the Add basics button on desktop', async () => {
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
    expect(basicsButton(plan)).toBeDefined();

    button(plan, 'List')!.click();
    await fixture.whenStable();
    expect(groupButtons(plan, 'Mode')).toEqual(['Stacks', 'List']);
    expect(group(plan, 'Group by')).toBeNull();
    expect(basicsButton(plan)).toBeDefined();
  });

  it('adds two copies with Add pressed twice in a row, focus staying on Add and the count updating after each', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);
    const add = addOf('Island');

    add.focus();
    add.click();
    await fixture.whenStable();
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(add);
    http
      .expectOne(addIslandUrl)
      .flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 1 }]));
    await vi.waitFor(() => expect(add.getAttribute('aria-disabled')).toBeNull());
    expect(mainboardCount('Island')).toBe(1);
    expect(document.activeElement).toBe(add);

    add.click();
    http
      .expectOne(addIslandUrl)
      .flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 2 }]));
    await vi.waitFor(() => expect(mainboardCount('Island')).toBe(2));
    expect(document.activeElement).toBe(add);
  });

  it('says when a change fails, and takes the error away once a later change is made', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    const dialog = await openBasics(fixture, plan);

    addOf('Island').click();
    http.expectOne(addIslandUrl).flush(null, serverError);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(boltAndShivanWith());
    await vi.waitFor(() =>
      expect(text(alertIn(dialog))).toBe("Couldn't change your plan. Try again in a moment."),
    );

    addOf('Island').click();
    http
      .expectOne(addIslandUrl)
      .flush(boltAndShivanWith([{ land: 'Island', board: 'Mainboard', count: 1 }]));
    await vi.waitFor(() => expect(mainboardCount('Island')).toBe(1));
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

    // With no basics, Clear basics is disabled: Plains's Add is the first control.
    pressTab();
    expect(document.activeElement).toBe(addOf('Plains'));
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
  ])('returns focus to the Add basics button on %s', async (_, close) => {
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
