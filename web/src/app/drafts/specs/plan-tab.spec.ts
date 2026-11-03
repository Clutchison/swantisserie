import { TestBed } from '@angular/core/testing';
import type { DraftView, PlanView } from 'contract';
import {
  useDraftsApp,
  alice,
  alicePlayer,
  bob,
  http,
  tabButton,
  panel,
  openDraft,
  openUrl,
  draft,
  flushPool,
  flushPicks,
  flushQueue,
  flushPlan,
  expectLoadingAnimation,
  completeSnapshot,
  button,
  updates,
  type AppFixture,
} from './harness';
import { card, useTallScreen, shivan, brightclimb } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

/** Plans are only open to app admins for now, and this Alice is one. */
describe('plan tab', () => {
  const admin = { ...alice, isAppAdmin: true };
  /** Started, with Alice then Bob; Bob is up. */
  const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
    state: 'Drafting',
    players: [alicePlayer, bob],
    turn: { pick: 3, round: 2, playerId: bob.id },
    ...fields,
  });
  const tabs = (page: HTMLElement) =>
    [...page.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim());
  const bolt = card({ id: 'bolt-card', name: 'Lightning Bolt', manaValue: 1 });
  const boltAgain = card({ id: 'bolt-card-2', name: 'Lightning Bolt', manaValue: 1 });
  const cards = [shivan, brightclimb, bolt, boltAgain];
  const planned = (card: { id: string; name: string }) => ({
    poolCardId: card.id,
    name: card.name,
  });
  /** As the API sorts it: by mana value, then name. */
  const planOf = (fields: Partial<PlanView> = {}): PlanView => ({
    mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain), planned(shivan)],
    sideboard: [],
    ...fields,
  });

  /** Opens the Plan tab and returns its panel. */
  async function openPlan(fixture: AppFixture, page: HTMLElement) {
    tabButton(page, 'Plan').click();
    await fixture.whenStable();
    return panel(page);
  }

  /** Each board's heading, and its lines as `count name`. */
  function boards(plan: HTMLElement) {
    return [...plan.querySelectorAll('section')].map((board) => ({
      heading: board.querySelector('h3')?.textContent?.trim(),
      lines: [...board.querySelectorAll('li:not(.empty)')].map(
        (line) =>
          `${line.querySelector('.count')?.textContent?.trim()} ${line.querySelector('.name')?.textContent?.trim()}`,
      ),
    }));
  }

  it('sits between Queue and Board for an app admin who is a player', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), { user: admin });

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Plan', 'Board', 'Me']);
    expect(tabButton(page, 'Plan').disabled).toBe(false);
  });

  it('is offered only to players', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }), {
      user: admin,
    });

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Plan', 'Board', 'Me']);
    expect(tabButton(page, 'Plan').disabled).toBe(true);
    http.expectNone('/api/drafts/draft-1/plan');
  });

  it('is not shown at all to a player who isn’t an app admin', async () => {
    const { page } = await openDraft(completeSnapshot, drafting());

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Board', 'Me']);
    http.expectNone('/api/drafts/draft-1/plan');
  });

  it('lists the mainboard and the sideboard, each line a count and a name, with a card preview', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan: planOf({ sideboard: [planned(shivan)] }),
    });
    const plan = await openPlan(fixture, page);

    expect(plan.querySelector('h2')?.textContent).toBe('Plan');
    expect(boards(plan)).toEqual([
      {
        heading: 'Mainboard (4)',
        lines: [
          '1 Brightclimb Pathway // Grimclimb Pathway',
          '2 Lightning Bolt',
          '1 Shivan Dragon',
        ],
      },
      { heading: 'Sideboard (1)', lines: ['1 Shivan Dragon'] },
    ]);
    const [mainboard, sideboard] = plan.querySelectorAll('section');
    expect(
      [...mainboard.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Move Brightclimb Pathway // Grimclimb Pathway to the sideboard',
      'Move Lightning Bolt to the sideboard',
      'Move Shivan Dragon to the sideboard',
    ]);
    expect(
      [...sideboard.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Move Shivan Dragon to the mainboard']);
  });

  it('shows a card preview when the mouse rests on a name', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const name = [...plan.querySelectorAll<HTMLElement>('.name > span')].find(
      (span) => span.textContent?.trim() === 'Shivan Dragon',
    )!;
    name.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(150);
    TestBed.tick();

    const preview = document.querySelector<HTMLImageElement>('app-card-preview img');
    expect(preview?.getAttribute('alt')).toBe('Shivan Dragon');
    name.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    TestBed.tick();
    expect(document.querySelector('app-card-preview img')).toBeNull();
    vi.useRealTimers();
  });

  it('says when a board is empty', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
    });
    const plan = await openPlan(fixture, page);

    const [mainboard, sideboard] = plan.querySelectorAll('section');
    expect(mainboard.querySelector('.empty')?.textContent?.trim()).toBe('No picks yet.');
    expect(sideboard.querySelector('.empty')?.textContent?.trim()).toBe(
      'Nothing on your sideboard.',
    );
  });

  it('moves one copy of a card to the other board, showing the plan the API answers with', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    button(plan, 'Move Lightning Bolt to the sideboard')!.click();
    await fixture.whenStable();
    expect(button(plan, 'Move Shivan Dragon to the sideboard')!.disabled).toBe(true);
    const req = http.expectOne('/api/drafts/draft-1/plan/bolt-card');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ board: 'Sideboard' });
    req.flush(
      planOf({
        mainboard: [planned(brightclimb), planned(boltAgain), planned(shivan)],
        sideboard: [planned(bolt)],
      }),
    );
    // The answer shows once its promise settles, a moment after the fixture is stable.
    await vi.waitFor(() =>
      expect(boards(plan)).toEqual([
        {
          heading: 'Mainboard (3)',
          lines: [
            '1 Brightclimb Pathway // Grimclimb Pathway',
            '1 Lightning Bolt',
            '1 Shivan Dragon',
          ],
        },
        { heading: 'Sideboard (1)', lines: ['1 Lightning Bolt'] },
      ]),
    );
    expect(button(plan, 'Move Shivan Dragon to the sideboard')!.disabled).toBe(false);

    button(plan, 'Move Lightning Bolt to the mainboard')!.click();
    const back = http.expectOne('/api/drafts/draft-1/plan/bolt-card');
    expect(back.request.body).toEqual({ board: 'Mainboard' });
    back.flush(planOf());
    await vi.waitFor(() =>
      expect(boards(plan)[1]).toEqual({ heading: 'Sideboard (0)', lines: [] }),
    );
  });

  it('says why a move was refused, and re-reads the plan', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    button(plan, 'Move Shivan Dragon to the sideboard')!.click();
    http
      .expectOne('/api/drafts/draft-1/plan/shivan-card')
      .flush(
        { error: 'not-in-plan', message: 'That card isn’t in your plan.' },
        { status: 409, statusText: 'Conflict' },
      );
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    await vi.waitFor(() =>
      expect(plan.querySelector('[role="alert"]')?.textContent).toContain(
        'That card isn’t in your plan.',
      ),
    );

    reread.flush(planOf({ mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)] }));
    await fixture.whenStable();
    expect(boards(plan)[0].lines).toEqual([
      '1 Brightclimb Pathway // Grimclimb Pathway',
      '2 Lightning Bolt',
    ]);
  });

  it('says so while the plan loads', async () => {
    const { page } = await openUrl('/drafts/draft-1', admin);
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool(cards);
    await flushPicks([]);
    await flushQueue({
      cards: [],
      lost: [],
      cleared: [],
      restKept: false,
      stealBehavior: 'ClearQueue',
    });
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    tabButton(page, 'Plan').click();
    await expectLoadingAnimation(() => panel(page), 'Loading your plan…', 64);

    req.flush(planOf());
    await vi.waitFor(() => expect(boards(panel(page))[0].heading).toBe('Mainboard (4)'));
  });

  it('says when the plan couldn’t be loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1', admin);
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool(cards);
    await flushPicks([]);
    await flushQueue({
      cards: [],
      lost: [],
      cleared: [],
      restKept: false,
      stealBehavior: 'ClearQueue',
    });
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(
      {},
      { status: 500, statusText: 'Server Error' },
    );
    await fixture.whenStable();

    const plan = await openPlan(fixture, page);
    expect(plan.querySelector('.error')?.textContent).toContain("Couldn't load your plan");
    expect(plan.querySelector('app-plan-tab')).toBeNull();
  });

  it('re-reads the plan when the draft changes, as a pick may have landed or been undone', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan: planOf({ mainboard: [planned(shivan)] }),
    });
    const plan = await openPlan(fixture, page);
    expect(boards(plan)[0].heading).toBe('Mainboard (1)');

    updates.events.next({ type: 'changed', draft: draft(drafting({ version: 1 })) });
    await flushPicks([]);
    await flushQueue({
      cards: [],
      lost: [],
      cleared: [],
      restKept: false,
      stealBehavior: 'ClearQueue',
    });
    await flushPlan(planOf());
    await fixture.whenStable();

    expect(boards(plan)[0].heading).toBe('Mainboard (4)');
  });

  it.each(['Lobby', 'Paused', 'Closed', 'Complete'] as const)(
    'can be changed while the draft is %s',
    async (state) => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        { players: [alicePlayer, bob], state, turn: null },
        { cards, user: admin, plan: planOf() },
      );
      const plan = await openPlan(fixture, page);

      expect(button(plan, 'Move Shivan Dragon to the sideboard')!.disabled).toBe(false);
    },
  );
});
