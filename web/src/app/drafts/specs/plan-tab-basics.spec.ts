import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import type { DraftView, PlannedBasicView, PlanView } from 'contract';
import {
  useDraftsApp,
  alice,
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
} from './harness';
import { card, useTallScreen, shivan } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

/** Plans are only open to app admins for now, and this Alice is one. */
describe('basic lands on the plan tab', () => {
  const admin = { ...alice, isAppAdmin: true };
  /** Started, with Alice then Bob; Bob is up. */
  const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
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

  /** Each board's heading, and its lines as `count name`. */
  const boards = (plan: HTMLElement) =>
    [...plan.querySelectorAll('section')].map((board) => ({
      heading: board.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim(),
      lines: [...board.querySelectorAll('li:not(.empty)')].map(
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
      user: admin,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);
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
    added.flush(planOf([{ land: 'Plains', board: 'Mainboard', count: 1 }]));
    await vi.waitFor(() => expect(countOf(plan, 'Plains').value).toBe('1'));
    expect(boards(plan)[0]).toEqual({
      heading: 'Mainboard 3 (3 picked)',
      lines: ['1 Lightning Bolt', '1 Shivan Dragon', '1 Plains'],
    });

    typeCount(plan, 'Island', '8');
    const typed = http.expectOne('/api/drafts/draft-1/plan/basics/Island');
    expect(typed.request.body).toEqual({ count: 8 });
    typed.flush(
      planOf([
        { land: 'Plains', board: 'Mainboard', count: 1 },
        { land: 'Island', board: 'Mainboard', count: 8 },
      ]),
    );
    await vi.waitFor(() =>
      expect(boards(plan)[0].lines).toEqual([
        '1 Lightning Bolt',
        '1 Shivan Dragon',
        '1 Plains',
        '8 Island',
      ]),
    );

    button(plan, 'One fewer Plains')!.click();
    const fewer = http.expectOne('/api/drafts/draft-1/plan/basics/Plains');
    expect(fewer.request.body).toEqual({ count: 0 });
    fewer.flush(planOf([{ land: 'Island', board: 'Mainboard', count: 8 }]));
    await vi.waitFor(() => expect(countOf(plan, 'Plains').value).toBe('0'));

    typeCount(plan, 'Island', '0');
    http.expectOne('/api/drafts/draft-1/plan/basics/Island').flush(planOf([]));
    await vi.waitFor(() =>
      expect(boards(plan)[0].lines).toEqual(['1 Lightning Bolt', '1 Shivan Dragon']),
    );
  });

  it('puts back a typed number that isn’t one, and keeps a typed number within 0 to 99', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan: planOf([{ land: 'Swamp', board: 'Mainboard', count: 2 }]),
    });
    const plan = await openPlan(fixture, page);

    typeCount(plan, 'Swamp', '');
    expect(countOf(plan, 'Swamp').value).toBe('2');
    http.expectNone('/api/drafts/draft-1/plan/basics/Swamp');

    typeCount(plan, 'Swamp', '250');
    expect(http.expectOne('/api/drafts/draft-1/plan/basics/Swamp').request.body).toEqual({
      count: 99,
    });
  });

  it('counts a basic across both boards, and moves it between them like any other card', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan: planOf([{ land: 'Forest', board: 'Mainboard', count: 3 }]),
    });
    const plan = await openPlan(fixture, page);

    button(plan, 'Move Forest to the sideboard')!.click();
    const moved = http.expectOne('/api/drafts/draft-1/plan/basics/Forest/move');
    expect(moved.request.method).toBe('POST');
    expect(moved.request.body).toEqual({ board: 'Sideboard' });
    moved.flush(
      planOf([
        { land: 'Forest', board: 'Mainboard', count: 2 },
        { land: 'Forest', board: 'Sideboard', count: 1 },
      ]),
    );

    await vi.waitFor(() =>
      expect(boards(plan)).toEqual([
        {
          heading: 'Mainboard 4 (4 picked)',
          lines: ['1 Lightning Bolt', '1 Shivan Dragon', '2 Forest'],
        },
        { heading: 'Sideboard 1 (1 picked)', lines: ['1 Forest'] },
      ]),
    );
    expect(countOf(plan, 'Forest').value).toBe('3');
    // A basic is no unpicked card: there's nothing to remove but by its count.
    expect(button(plan, 'Remove Forest from your plan')).toBeUndefined();
    button(plan, 'Move Forest to the mainboard')!.click();
    expect(http.expectOne('/api/drafts/draft-1/plan/basics/Forest/move').request.body).toEqual({
      board: 'Mainboard',
    });
  });

  it('clears every basic, on both boards', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan: planOf([
        { land: 'Mountain', board: 'Mainboard', count: 5 },
        { land: 'Wastes', board: 'Sideboard', count: 1 },
      ]),
    });
    const plan = await openPlan(fixture, page);

    button(plan, 'Clear basics')!.click();
    const cleared = http.expectOne('/api/drafts/draft-1/plan/basics');
    expect(cleared.request.method).toBe('DELETE');
    cleared.flush(planOf());

    await vi.waitFor(() => expect(countOf(plan, 'Mountain').value).toBe('0'));
    expect(countOf(plan, 'Wastes').value).toBe('0');
    expect(boards(plan)[1].lines).toEqual([]);
    expect(button(plan, 'Clear basics')!.disabled).toBe(true);
  });

  it('can change basics once the draft is complete', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Complete', turn: null }),
      { cards, user: admin, plan: planOf() },
    );
    const plan = await openPlan(fixture, page);

    button(plan, 'One more Wastes')!.click();
    http.expectOne('/api/drafts/draft-1/plan/basics/Wastes');
  });

  it('shows basics in the Lands stack on desktop, with their card images, and moves one dragged onto the other board', async () => {
    viewOn('desktop');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan: planOf([{ land: 'Island', board: 'Mainboard', count: 2 }]),
    });
    const plan = await openPlan(fixture, page);

    const lands = [...plan.querySelectorAll('.stack')].find(
      (stack) => stack.querySelector('.stack-name')?.textContent?.trim() === 'Lands',
    )!;
    const images = [...lands.querySelectorAll('img')];
    expect(images.map((image) => image.alt)).toEqual(['Island', 'Island']);
    expect(images[0].getAttribute('src')).toBe(
      'https://api.scryfall.com/cards/named?exact=Island&format=image&version=normal',
    );

    // The Queue tab has a drop list of its own.
    const [mainboard, sideboard] = fixture.debugElement
      .query(By.css('app-plan-tab'))
      .queryAll(By.directive(CdkDropList));
    const island = mainboard
      .queryAll(By.directive(CdkDrag))
      .find((drag) => drag.nativeElement.querySelector('img')?.alt === 'Island')!;
    sideboard.triggerEventHandler('cdkDropListDropped', {
      item: island.injector.get(CdkDrag),
      previousContainer: mainboard.injector.get(CdkDropList),
      container: sideboard.injector.get(CdkDropList),
    });
    const moved = http.expectOne('/api/drafts/draft-1/plan/basics/Island/move');
    expect(moved.request.body).toEqual({ board: 'Sideboard' });
  });
});
