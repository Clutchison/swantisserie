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
  viewOn,
  type AppFixture,
  drafting,
} from './harness';
import {
  clickBackdrop,
  hiddenFromAssistiveTech,
  openDialog,
  pressEscape,
  pressTab,
} from '../../specs-harness';
import { useTallScreen, shivan } from './pool-tab-harness';
import { bobsTurn, bolt, openPlan, planBoards, planned } from './plan-tab-harness';

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
    ...fields,
  });

  /** The Basic lands button, whatever count it shows. */
  const basicsButton = (plan: HTMLElement) =>
    [...plan.querySelectorAll('button')].find((b) =>
      b.textContent?.trim().startsWith('Basic lands'),
    );
  /** Opens the Basic lands modal, and answers with it. */
  async function openBasics(fixture: AppFixture, plan: HTMLElement) {
    basicsButton(plan)!.click();
    await fixture.whenStable();
    return openDialog()!;
  }
  /** A button in the open modal, by its text or aria-label. */
  const inModal = (label: string) => button(openDialog()!, label);

  /** The Basic lands control's number for `land`, if the modal is open. */
  const countOf = (land: string) => document.querySelector<HTMLInputElement>(`#basic-${land}`)!;
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
    expect(inModal('One fewer Plains')!.disabled).toBe(true);

    inModal('One more Plains')!.click();
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

    inModal('One fewer Plains')!.click();
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
    // Said in the modal, as the page behind it is hidden from assistive technology.
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

    inModal('Clear basics')!.click();
    const cleared = http.expectOne('/api/drafts/draft-1/plan/basics');
    expect(cleared.request.method).toBe('DELETE');
    cleared.flush(boltAndShivanWith());

    await vi.waitFor(() => expect(countOf('Mountain').value).toBe('0'));
    expect(countOf('Wastes').value).toBe('0');
    expect(planBoards(plan)[0].lines).toEqual(['1 Lightning Bolt', '1 Shivan Dragon']);
    expect(inModal('Clear basics')!.disabled).toBe(true);
  });

  it('can change basics once the draft is complete', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Complete', turn: null }),
      { cards, plan: boltAndShivanWith() },
    );
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    inModal('One more Wastes')!.click();
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

    const lands = [...plan.querySelectorAll('.stack')].find(
      (stack) => stack.querySelector('.stack-name')?.textContent?.trim() === 'Lands',
    )!;
    const images = [...lands.querySelectorAll('img')];
    expect(images.map((image) => image.alt)).toEqual(['Island', 'Island']);
    expect(images[0].getAttribute('src')).toBe(
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

  it('sets basics in a Basic lands modal, not above the plan boards, each labelled by its mana symbol', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    expect(countOf('Plains')).toBeNull();
    expect(openDialog()).toBeNull();

    const modal = await openBasics(fixture, plan);
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.querySelector('h3')?.textContent?.trim()).toBe('Basic lands');
    const symbols = [...modal.querySelectorAll<HTMLImageElement>('label img')];
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
    expect(modal.querySelector('label[for="basic-Wastes"] img')?.getAttribute('alt')).toBe(
      'Wastes',
    );
    expect(button(modal, 'Clear basics')).toBeDefined();
    expect(button(modal, 'Done')).toBeDefined();
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

    const modal = await openBasics(fixture, plan);
    button(modal, 'One more Wastes')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Wastes').flush(
      boltAndShivanWith([
        { land: 'Mountain', count: 5 },
        { land: 'Wastes', count: 2 },
      ]),
    );
    // The plan behind the modal updates as each change saves.
    await vi.waitFor(() => expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands (7)'));
    expect(planBoards(plan)[0].lines).toContain('2 Wastes');

    button(modal, 'Clear basics')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics').flush(boltAndShivanWith());
    await vi.waitFor(() => expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands'));
    expect(openDialog()).not.toBeNull();
  });

  it('closes the modal on Done, on Escape and on a click on the backdrop', async () => {
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

    // A click inside the modal leaves it open.
    const modal = await openBasics(fixture, plan);
    modal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    modal.click();
    await fixture.whenStable();
    expect(openDialog()).not.toBeNull();
    clickBackdrop();
    await fixture.whenStable();
    expect(openDialog()).toBeNull();
  });

  it('shows only the Basic lands button in the mode controls on mobile', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    const controls = (plan: HTMLElement) =>
      [...plan.querySelectorAll('.mode-controls button')].map((b) => b.textContent?.trim());
    expect(controls(plan)).toEqual(['Basic lands']);
  });

  it('shows the Basic lands button after the view controls on desktop', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    const controls = () =>
      [...plan.querySelectorAll('.mode-controls button')].map((b) => b.textContent?.trim());
    expect(controls()).toEqual(['Stacks', 'List', 'Mana value', 'Color', 'Type', 'Basic lands']);

    button(plan, 'List')!.click();
    await fixture.whenStable();
    expect(controls()).toEqual(['Stacks', 'List', 'Basic lands']);
  });

  it('adds two basics with + pressed twice in a row, focus staying on +', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);
    const more = inModal('One more Island')!;

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

    inModal('One fewer Island')!.focus();
    inModal('One fewer Island')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Island').flush(boltAndShivanWith());

    await vi.waitFor(() => expect(document.activeElement).toBe(inModal('One more Island')));
  });

  it('opens on Done, and keeps Tab and Shift+Tab inside the modal, wrapping at either end', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);
    await vi.waitFor(() => expect(document.activeElement).toBe(inModal('Done')));

    // With no basics, − and Clear basics are disabled: Plains's number is the first control.
    pressTab();
    expect(document.activeElement).toBe(countOf('Plains'));
    pressTab({ shift: true });
    expect(document.activeElement).toBe(inModal('Done'));
  });

  it('hides the page behind the modal from assistive technology while it is open', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: boltAndShivanWith(),
    });
    const plan = await openPlan(fixture, page);
    const modal = await openBasics(fixture, plan);

    await vi.waitFor(() => expect(hiddenFromAssistiveTech(basicsButton(plan)!)).toBe(true));
    expect(hiddenFromAssistiveTech(modal)).toBe(false);

    inModal('Done')!.click();
    await fixture.whenStable();
    expect(hiddenFromAssistiveTech(basicsButton(plan)!)).toBe(false);
  });

  it.each<[string, () => void]>([
    ['Done', () => inModal('Done')!.click()],
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
    await vi.waitFor(() => expect(document.activeElement).toBe(inModal('Done')));

    close();
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
    expect(document.activeElement).toBe(basicsButton(plan));
  });
});
