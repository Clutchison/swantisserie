import type { PlannedBasicView } from 'contract';
import {
  useDraftsApp,
  http,
  openDraft,
  completeSnapshot,
  viewOn,
  drafting,
  button,
  heading,
  draggable,
  resizeTo,
  tabButton,
  namedList,
  updates,
  draft,
  flushPicks,
  flushQueueAndPlan,
  pickOf,
  queueOf,
  alice,
  bob,
  type AppFixture,
} from './harness';
import { useTallScreen, shivan, brightclimb } from './pool-tab-harness';
import {
  bobsTurn,
  bolt,
  boltAgain,
  cards,
  planned,
  unpicked,
  planOf,
  openPlan,
  detailOpener,
  stack,
  stacksOf,
  dropListNamed,
  acceptsDrop,
  dragOf,
  drop,
  dropped,
} from './plan-tab-harness';
import { playing, withTournament } from './play-tab-harness';

useDraftsApp();
useTallScreen();

const shivanUrl = '/api/drafts/draft-1/plan/shivan-card';
const basicUrl = (land: string) => `/api/drafts/draft-1/plan/basics/${land}`;
const withBasics = (basics: PlannedBasicView[]) => planOf({ basics });

/** Drops the card named `name` from the stack `from` on the stack `onto`, and renders what came of it. */
async function stackMoved(fixture: AppFixture, name: string, from: string, onto: string) {
  dropped(name, dropListNamed(fixture, from), dropListNamed(fixture, onto));
  await fixture.whenStable();
}

describe('Deck tab stack moves', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('moves a mainboard card dropped on another stack into it, sorted there by mana value then name, sending nothing', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    dropped('Shivan Dragon', dropListNamed(fixture, '6'), dropListNamed(fixture, '1'));
    await fixture.whenStable();

    expect(stacksOf(plan)[0]).toEqual([
      '1: Lightning Bolt, Lightning Bolt, Shivan Dragon',
      'Lands: Brightclimb Pathway // Grimclimb Pathway',
    ]);
    http.expectNone('/api/drafts/draft-1/plan/shivan-card');
  });

  it('moves lands and basic lands too', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: withBasics([{ land: 'Island', board: 'Mainboard', count: 2 }]),
    });
    const plan = await openPlan(fixture, page);

    await stackMoved(fixture, 'Brightclimb Pathway', 'Lands', '6');
    await stackMoved(fixture, 'Island', 'Lands', '1');

    expect(stacksOf(plan)[0]).toEqual([
      '1: Island, Lightning Bolt, Lightning Bolt',
      '6: Brightclimb Pathway // Grimclimb Pathway, Shivan Dragon',
      'Lands: Island',
    ]);
    http.expectNone((req) => req.url.startsWith('/api/drafts/draft-1/plan/'));
  });

  it('moves a sideboard card dropped on a mainboard stack to the mainboard, with one request, and into that stack', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({
        mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
        sideboard: [planned(shivan)],
        basics: [{ land: 'Forest', board: 'Sideboard', count: 1 }],
      }),
    });
    const plan = await openPlan(fixture, page);

    await stackMoved(fixture, 'Shivan Dragon', 'Sideboard', '1');
    const moved = http.expectOne(shivanUrl);
    expect(moved.request.body).toEqual({ board: 'Mainboard' });
    moved.flush(withBasics([{ land: 'Forest', board: 'Sideboard', count: 1 }]));
    await vi.waitFor(() =>
      expect(stack(plan, '1')).toEqual(['Lightning Bolt', 'Lightning Bolt', 'Shivan Dragon']),
    );

    await stackMoved(fixture, 'Forest', 'Sideboard', '1');
    const movedBasic = http.expectOne(basicUrl('Forest'));
    expect(movedBasic.request.body).toEqual({ board: 'Mainboard' });
    movedBasic.flush(withBasics([{ land: 'Forest', board: 'Mainboard', count: 1 }]));
    await vi.waitFor(() =>
      expect(stacksOf(plan)[0]).toEqual([
        '1: Forest, Lightning Bolt, Lightning Bolt, Shivan Dragon',
        'Lands: Brightclimb Pathway // Grimclimb Pathway',
      ]),
    );
  });

  it('keeps stack moves through a tab switch, list mode and a narrow window, showing the grouping’s stacks in the strip, which offers no drag', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf(),
    });
    let plan = await openPlan(fixture, page);
    await stackMoved(fixture, 'Shivan Dragon', '6', '1');
    const moved = [
      '1: Lightning Bolt, Lightning Bolt, Shivan Dragon',
      'Lands: Brightclimb Pathway // Grimclimb Pathway',
    ];

    tabButton(page, 'Pool').click();
    await fixture.whenStable();
    plan = await openPlan(fixture, page);
    expect(stacksOf(plan)[0]).toEqual(moved);

    button(plan, 'List')!.click();
    await fixture.whenStable();
    button(plan, 'Stacks')!.click();
    await fixture.whenStable();
    expect(stacksOf(plan)[0]).toEqual(moved);

    resizeTo('mobile');
    await fixture.whenStable();
    expect(stacksOf(plan)[0]).toEqual([
      '1: Lightning Bolt, Lightning Bolt',
      '6: Shivan Dragon',
      'Lands: Brightclimb Pathway // Grimclimb Pathway',
    ]);
    expect(draggable(fixture, detailOpener(plan, 'Shivan Dragon')!)).toBe(false);
    expect(dropListNamed(fixture, 'New stack, after 1')).toBeUndefined();

    resizeTo('desktop');
    await fixture.whenStable();
    expect(stacksOf(plan)[0]).toEqual(moved);
  });

  it('wipes stack moves as the grouping changes', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);
    await stackMoved(fixture, 'Shivan Dragon', '6', '1');

    button(plan, 'Color')!.click();
    await fixture.whenStable();
    button(plan, 'Mana value')!.click();
    await fixture.whenStable();

    expect(stack(plan, '6')).toEqual(['Shivan Dragon']);
  });

  it('puts a card that left the mainboard and came back in its own stack, keeping the other stack moves', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);
    await stackMoved(fixture, 'Shivan Dragon', '6', '1');
    await stackMoved(fixture, 'Brightclimb Pathway', 'Lands', '1');

    button(plan, 'Move Shivan Dragon to the sideboard')!.click();
    http.expectOne(shivanUrl).flush(
      planOf({
        mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
        sideboard: [planned(shivan)],
      }),
    );
    await vi.waitFor(() => expect(stack(plan, 'Sideboard')).toEqual(['Shivan Dragon']));
    button(plan, 'Move Shivan Dragon to the mainboard')!.click();
    http.expectOne(shivanUrl).flush(planOf());

    await vi.waitFor(() =>
      expect(stacksOf(plan)[0]).toEqual([
        '1: Brightclimb Pathway // Grimclimb Pathway, Lightning Bolt, Lightning Bolt',
        '6: Shivan Dragon',
      ]),
    );
  });

  it('takes the stack move of a basic land’s copy that leaves the mainboard, keeping its other copies’ moves', async () => {
    const twoIslands = (sideboard = 0): PlannedBasicView[] => [
      { land: 'Island', board: 'Mainboard', count: 2 - sideboard },
      ...(sideboard
        ? [{ land: 'Island' as const, board: 'Sideboard' as const, count: sideboard }]
        : []),
    ];
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: withBasics(twoIslands()),
    });
    const plan = await openPlan(fixture, page);

    // The moved copy leaves: the one left stays in Lands.
    await stackMoved(fixture, 'Island', 'Lands', '1');
    dropped('Island', dropListNamed(fixture, '1'), dropListNamed(fixture, 'Sideboard'));
    http.expectOne(basicUrl('Island')).flush(withBasics(twoIslands(1)));
    await vi.waitFor(() => expect(stack(plan, 'Sideboard')).toEqual(['Island']));
    expect(stack(plan, '1')).toEqual(['Lightning Bolt', 'Lightning Bolt']);
    expect(stack(plan, 'Lands')).toEqual(['Brightclimb Pathway // Grimclimb Pathway', 'Island']);

    // Back to two, the second copy moved: the first leaves, and the moved one stays moved.
    button(plan, 'Move Island to the mainboard')!.click();
    http.expectOne(basicUrl('Island')).flush(withBasics(twoIslands()));
    await vi.waitFor(() => expect(stack(plan, 'Lands')).toHaveLength(3));
    drop(dragOf(dropListNamed(fixture, 'Lands'), 'Island', 1), dropListNamed(fixture, '1'));
    await fixture.whenStable();
    button(namedList(plan, 'Lands'), 'Move Island to the sideboard')!.click();
    http.expectOne(basicUrl('Island')).flush(withBasics(twoIslands(1)));
    await vi.waitFor(() => expect(stack(plan, 'Sideboard')).toEqual(['Island']));
    expect(stack(plan, '1')).toEqual(['Island', 'Lightning Bolt', 'Lightning Bolt']);
    expect(stack(plan, 'Lands')).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
  });

  it('keeps the stack move of an unpicked card another player picks, on the copy that takes its place', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({ mainboard: [planned(brightclimb), unpicked(bolt), planned(shivan)] }),
    });
    const plan = await openPlan(fixture, page);
    await stackMoved(fixture, 'Lightning Bolt', '1', '6');

    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: { ...bobsTurn, pick: 4, playerId: alice.id }, version: 1 })),
    });
    await flushPicks([pickOf({ playerId: bob.id, poolCardId: bolt.id })]);
    await flushQueueAndPlan(
      queueOf(),
      planOf({ mainboard: [planned(brightclimb), unpicked(boltAgain), planned(shivan)] }),
    );
    await fixture.whenStable();

    expect(stacksOf(plan)[0]).toEqual([
      '6: Lightning Bolt (unpicked), Shivan Dragon',
      'Lands: Brightclimb Pathway // Grimclimb Pathway',
    ]);
  });

  it('makes stack moves on a locked deck, whose sideboard refuses a drop, sending nothing', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, withTournament(playing()), {
      cards,
      plan: planOf({
        mainboard: [planned(brightclimb), planned(bolt), planned(shivan)],
        sideboard: [planned(boltAgain)],
      }),
      tournament: playing(),
    });
    const plan = await openPlan(fixture, page);

    await stackMoved(fixture, 'Shivan Dragon', '6', '1');
    expect(stack(plan, '1')).toEqual(['Lightning Bolt', 'Shivan Dragon']);

    const sideboard = namedList(plan, 'Sideboard');
    expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(true);
    expect(draggable(fixture, detailOpener(sideboard, 'Lightning Bolt')!)).toBe(false);
    const boltDrag = dragOf(dropListNamed(fixture, '1'), 'Lightning Bolt');
    expect(acceptsDrop(dropListNamed(fixture, 'Sideboard'), boltDrag)).toBe(false);
    expect(acceptsDrop(dropListNamed(fixture, 'Lands'), boltDrag)).toBe(true);
    await stackMoved(fixture, 'Lightning Bolt', '1', 'Sideboard');
    expect(stack(plan, 'Sideboard')).toEqual(['Lightning Bolt']);
    http.expectNone((req) => req.url.startsWith('/api/drafts/draft-1/plan/'));
  });

  it('makes a new stack of the player’s own in a gap between stacks, or before the first or after the last, holding the card, which takes drops like any stack, sending nothing', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    await stackMoved(fixture, 'Shivan Dragon', '6', 'New stack, after 1');
    await stackMoved(fixture, 'Brightclimb Pathway', 'Lands', 'New stack, at the start');
    expect(stacksOf(plan)[0]).toEqual([
      'Your stack, at the start: Brightclimb Pathway // Grimclimb Pathway',
      '1: Lightning Bolt, Lightning Bolt',
      'Your stack, after 1: Shivan Dragon',
    ]);

    await stackMoved(fixture, 'Lightning Bolt', '1', 'New stack, after Your stack, after 1');
    expect(stacksOf(plan)[0]).toEqual([
      'Your stack, at the start: Brightclimb Pathway // Grimclimb Pathway',
      '1: Lightning Bolt',
      'Your stack, after 1: Shivan Dragon',
      'Your stack 2, after 1: Lightning Bolt',
    ]);

    // Emptied, a player-made stack goes, and the one made after it takes its place.
    await stackMoved(fixture, 'Shivan Dragon', 'Your stack, after 1', 'Your stack 2, after 1');
    expect(stacksOf(plan)[0]).toEqual([
      'Your stack, at the start: Brightclimb Pathway // Grimclimb Pathway',
      '1: Lightning Bolt',
      'Your stack, after 1: Lightning Bolt, Shivan Dragon',
    ]);
    http.expectNone((req) => req.url.startsWith('/api/drafts/draft-1/plan/'));
  });

  it('moves a sideboard card dropped in a gap to the mainboard, with one request, and into a new stack there', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({
        mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
        sideboard: [planned(shivan)],
      }),
    });
    const plan = await openPlan(fixture, page);

    await stackMoved(fixture, 'Shivan Dragon', 'Sideboard', 'New stack, after Lands');
    const moved = http.expectOne(shivanUrl);
    expect(moved.request.body).toEqual({ board: 'Mainboard' });
    moved.flush(planOf());

    await vi.waitFor(() =>
      expect(stacksOf(plan)[0]).toEqual([
        '1: Lightning Bolt, Lightning Bolt',
        'Lands: Brightclimb Pathway // Grimclimb Pathway',
        'Your stack, after Lands: Shivan Dragon',
      ]),
    );
  });

  it('makes new stacks on a locked deck, sending nothing', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, withTournament(playing()), {
      cards,
      plan: planOf(),
      tournament: playing(),
    });
    const plan = await openPlan(fixture, page);

    expect(
      acceptsDrop(
        dropListNamed(fixture, 'New stack, after 1'),
        dragOf(dropListNamed(fixture, '6'), 'Shivan Dragon'),
      ),
    ).toBe(true);
    await stackMoved(fixture, 'Shivan Dragon', '6', 'New stack, after 1');

    expect(stack(plan, 'Your stack, after 1')).toEqual(['Shivan Dragon']);
    http.expectNone((req) => req.url.startsWith('/api/drafts/draft-1/plan/'));
  });

  it('shows the mainboard’s stacks without name and count headings in the wide layout, each still named for screen readers', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    expect(heading(plan, '1 2')).toBeUndefined();
    expect(heading(plan, 'Mainboard 4 (4 picked)')).toBeDefined();
    expect(stack(plan, '1')).toEqual(['Lightning Bolt', 'Lightning Bolt']);

    resizeTo('mobile');
    await fixture.whenStable();
    expect(heading(plan, '1 2')).toBeDefined();
  });
});
