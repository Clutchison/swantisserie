import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import type { PlannedBasicView, PlanView } from 'contract';
import {
  useDraftsApp,
  alicePlayer,
  bob,
  http,
  tabButton,
  panel,
  openDraft,
  completeSnapshot,
  button,
  viewOn,
  type AppFixture,
  type DraftFixture,
} from './harness';
import { card, useTallScreen, shivan } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('basic lands on the plan tab', () => {
  /** Started, with Alice then Bob; Bob is up. */
  const drafting = (fields: DraftFixture = {}): DraftFixture => ({
    state: 'Drafting',
    players: [alicePlayer, bob],
    turn: { pick: 3, round: 2, playerId: bob.id },
    ...fields,
  });
  const bolt = card({ id: 'bolt-card', name: 'Lightning Bolt', manaValue: 1, typeLine: 'Instant' });
  const cards = [shivan, bolt];
  const planOf = (basics: PlannedBasicView[] = [], fields: Partial<PlanView> = {}): PlanView => ({
    mainboard: [
      { poolCardId: bolt.id, name: bolt.name, picked: true },
      { poolCardId: shivan.id, name: shivan.name, picked: true },
    ],
    sideboard: [],
    basics,
    lost: [],
    ...fields,
  });

  async function openPlan(fixture: AppFixture, page: HTMLElement) {
    tabButton(page, 'Plan').click();
    await fixture.whenStable();
    return panel(page);
  }

  /** The Basic lands button, whatever count it shows. */
  const basicsButton = (plan: HTMLElement) =>
    [...plan.querySelectorAll('button')].find((b) =>
      b.textContent?.trim().startsWith('Basic lands'),
    );
  /** The open modal, if any. */
  const dialog = (plan: HTMLElement) => plan.querySelector<HTMLElement>('[role="dialog"]');
  /** Opens the Basic lands modal, and answers with it. */
  async function openBasics(fixture: AppFixture, plan: HTMLElement) {
    basicsButton(plan)!.click();
    await fixture.whenStable();
    return dialog(plan)!;
  }

  /** Each plan board's heading, and its lines as `count name`. */
  const planBoards = (plan: HTMLElement) =>
    [...plan.querySelectorAll('section')].map((planBoard) => ({
      heading: planBoard.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim(),
      lines: [...planBoard.querySelectorAll('li:not(.empty)')].map(
        (line) =>
          `${line.querySelector('.count')?.textContent?.trim()} ${line.querySelector('.name')?.textContent?.trim()}`,
      ),
    }));
  /** The Basic lands control's number for `land`. */
  const countOf = (plan: HTMLElement, land: string) =>
    plan.querySelector<HTMLInputElement>(`#basic-${land}`)!;
  /** Types `value` into the number for `land`, as a player does before leaving it. */
  function typeCount(plan: HTMLElement, land: string, value: string) {
    const input = countOf(plan, land);
    input.value = value;
    input.dispatchEvent(new Event('change'));
  }

  it('adds and removes each basic with − and +, and by typing a number, on the mainboard', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);
    expect(
      ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'].map(
        (land) => countOf(plan, land).value,
      ),
    ).toEqual(['0', '0', '0', '0', '0', '0']);
    expect(button(plan, 'One fewer Plains')!.disabled).toBe(true);

    button(plan, 'One more Plains')!.click();
    const added = http.expectOne('/api/drafts/draft-1/plan/basics/Plains');
    expect(added.request.method).toBe('PUT');
    expect(added.request.body).toEqual({ count: 1 });
    added.flush(planOf([{ land: 'Plains', count: 1 }]));
    await vi.waitFor(() => expect(countOf(plan, 'Plains').value).toBe('1'));
    expect(planBoards(plan)[0]).toEqual({
      heading: 'Mainboard 3 (3 picked)',
      lines: ['1 Lightning Bolt', '1 Shivan Dragon', '1 Plains'],
    });

    typeCount(plan, 'Island', '8');
    const typed = http.expectOne('/api/drafts/draft-1/plan/basics/Island');
    expect(typed.request.body).toEqual({ count: 8 });
    typed.flush(
      planOf([
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

    button(plan, 'One fewer Plains')!.click();
    const fewer = http.expectOne('/api/drafts/draft-1/plan/basics/Plains');
    expect(fewer.request.body).toEqual({ count: 0 });
    fewer.flush(planOf([{ land: 'Island', count: 8 }]));
    await vi.waitFor(() => expect(countOf(plan, 'Plains').value).toBe('0'));

    typeCount(plan, 'Island', '0');
    http.expectOne('/api/drafts/draft-1/plan/basics/Island').flush(planOf([]));
    await vi.waitFor(() =>
      expect(planBoards(plan)[0].lines).toEqual(['1 Lightning Bolt', '1 Shivan Dragon']),
    );
  });

  it('puts back a typed number that isn’t one, and keeps a typed number within 0 to 99', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf([{ land: 'Swamp', count: 2 }]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    typeCount(plan, 'Swamp', '');
    expect(countOf(plan, 'Swamp').value).toBe('2');
    http.expectNone('/api/drafts/draft-1/plan/basics/Swamp');

    typeCount(plan, 'Swamp', '250');
    expect(http.expectOne('/api/drafts/draft-1/plan/basics/Swamp').request.body).toEqual({
      count: 99,
    });
  });

  it('puts back a typed count the api refuses', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    typeCount(plan, 'Island', '8');
    http
      .expectOne('/api/drafts/draft-1/plan/basics/Island')
      .flush(
        { error: 'draft-not-open', message: 'This draft isn’t open.' },
        { status: 409, statusText: 'Conflict' },
      );
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    reread.flush(planOf());
    await fixture.whenStable();

    await vi.waitFor(() => expect(countOf(plan, 'Island').value).toBe('0'));
    expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands');
  });

  it('keeps basics on the mainboard, with nothing to move or remove them by but their count', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf([{ land: 'Forest', count: 3 }]),
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
    expect(countOf(plan, 'Forest').value).toBe('3');
    expect(button(plan, 'Move Forest to the sideboard')).toBeUndefined();
    expect(button(plan, 'Remove Forest from your plan')).toBeUndefined();
    expect(button(plan, 'Move Shivan Dragon to the sideboard')).toBeDefined();
  });

  it('clears every basic', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf([
        { land: 'Mountain', count: 5 },
        { land: 'Wastes', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    button(plan, 'Clear basics')!.click();
    const cleared = http.expectOne('/api/drafts/draft-1/plan/basics');
    expect(cleared.request.method).toBe('DELETE');
    cleared.flush(planOf());

    await vi.waitFor(() => expect(countOf(plan, 'Mountain').value).toBe('0'));
    expect(countOf(plan, 'Wastes').value).toBe('0');
    expect(planBoards(plan)[0].lines).toEqual(['1 Lightning Bolt', '1 Shivan Dragon']);
    expect(button(plan, 'Clear basics')!.disabled).toBe(true);
  });

  it('can change basics once the draft is complete', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Complete', turn: null }),
      { cards, plan: planOf() },
    );
    const plan = await openPlan(fixture, page);
    await openBasics(fixture, plan);

    button(plan, 'One more Wastes')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Wastes');
  });

  it('shows basics in the Lands stack on desktop, with their card images, and can’t be dragged off the mainboard', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf([{ land: 'Island', count: 2 }]),
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
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf([{ land: 'Island', count: 1 }]),
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
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);
    expect(countOf(plan, 'Plains')).toBeNull();
    expect(dialog(plan)).toBeNull();

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
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf([
        { land: 'Mountain', count: 5 },
        { land: 'Wastes', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);
    expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands (6)');

    const modal = await openBasics(fixture, plan);
    button(modal, 'One more Wastes')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Wastes').flush(
      planOf([
        { land: 'Mountain', count: 5 },
        { land: 'Wastes', count: 2 },
      ]),
    );
    // The plan behind the modal updates as each change saves.
    await vi.waitFor(() => expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands (7)'));
    expect(planBoards(plan)[0].lines).toContain('2 Wastes');

    button(modal, 'Clear basics')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics').flush(planOf());
    await vi.waitFor(() => expect(basicsButton(plan)!.textContent?.trim()).toBe('Basic lands'));
    expect(dialog(plan)).not.toBeNull();
  });

  it('closes the modal on Done, on Escape and on a click on the backdrop', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    button(await openBasics(fixture, plan), 'Done')!.click();
    await fixture.whenStable();
    expect(dialog(plan)).toBeNull();

    await openBasics(fixture, plan);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(dialog(plan)).toBeNull();

    // A click inside the modal leaves it open.
    const modal = await openBasics(fixture, plan);
    modal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    modal.click();
    await fixture.whenStable();
    expect(dialog(plan)).not.toBeNull();
    const backdrop = modal.parentElement!;
    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    backdrop.click();
    await fixture.whenStable();
    expect(dialog(plan)).toBeNull();
  });

  it('shows only the Basic lands button in the mode controls on mobile', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf(),
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
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);
    const controls = () =>
      [...plan.querySelectorAll('.mode-controls button')].map((b) => b.textContent?.trim());
    expect(controls()).toEqual(['Stacks', 'List', 'Mana value', 'Color', 'Type', 'Basic lands']);

    button(plan, 'List')!.click();
    await fixture.whenStable();
    expect(controls()).toEqual(['Stacks', 'List', 'Basic lands']);
  });
});
