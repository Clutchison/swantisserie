import {
  useDraftsApp,
  bob,
  http,
  openDraft,
  completeSnapshot,
  button,
  drafting,
  statusMessage,
  text,
  toggleButton,
  type AppFixture,
} from './harness';
import { alertIn, comesBefore, onlyAlert, statusIn } from '../../specs-harness';
import { useTallScreen, shivan, brightclimb } from './pool-tab-harness';
import {
  bobsTurn,
  bolt,
  boltAgain,
  cards,
  deckNotice,
  DECK_NOTICE,
  expectByTools,
  itemOf,
  planned,
  unpicked,
  planOf,
  openPlan,
  planBoards,
  READY_NOTICE,
} from './plan-tab-harness';

useDraftsApp();
useTallScreen();

const SHIVAN_URL = '/api/drafts/draft-1/plan/shivan-card';
const NOTICE_URL = '/api/drafts/draft-1/plan/notice';
const MOVE_SHIVAN = 'Move Shivan Dragon to the sideboard';
const notInPlan = { error: 'not-in-plan', message: 'That card isn’t in your deck.' };
const conflict = { status: 409, statusText: 'Conflict' };
const serverError = { status: 500, statusText: 'Server Error' };
/** A plan whose Deck notice names Shivan Dragon, lost to Bob. */
const withLost = planOf({
  mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
  lost: [{ poolCardId: shivan.id, name: shivan.name, pickedBy: bob.id }],
});

/** Opens the Deck tab of a drafting draft on Bob's turn, the plan `plan`. */
async function openPlanOf(plan = planOf()) {
  const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
    cards,
    plan,
  });
  return { fixture, plan: await openPlan(fixture, page) };
}

/** Answers the change sent to `url` with `answer` and `init`, then the plan's re-read with `reread`. */
async function refused(
  fixture: AppFixture,
  url: string,
  reread = planOf(),
  answer: object | null = notInPlan,
  init = conflict,
) {
  http.expectOne(url).flush(answer, init);
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(reread);
  await fixture.whenStable();
}

describe('the Deck tab’s failed changes', () => {
  it('says why a move was refused, and re-reads the plan', async () => {
    const { fixture, plan } = await openPlanOf();

    button(plan, MOVE_SHIVAN)!.click();
    http.expectOne(SHIVAN_URL).flush(notInPlan, conflict);
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    await vi.waitFor(() =>
      expect(alertIn(plan)?.textContent).toContain('That card isn’t in your deck.'),
    );

    reread.flush(planOf({ mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)] }));
    await fixture.whenStable();
    expect(planBoards(plan)[0].lines).toEqual([
      '1 Brightclimb Pathway // Grimclimb Pathway',
      '2 Lightning Bolt',
    ]);
    expect(statusMessage(plan, 'Shivan Dragon moved to the sideboard')).toBeUndefined();
    // Its card has left the mainboard, so it shows by the tools.
    expectByTools(plan, onlyAlert(plan));
  });

  it('shows a refused move from a line inside that line’s list item', async () => {
    const { fixture, plan } = await openPlanOf();

    button(plan, MOVE_SHIVAN)!.click();
    await refused(fixture, SHIVAN_URL);

    expect(text(onlyAlert(plan))).toBe('That card isn’t in your deck.');
    expect(alertIn(itemOf(plan, MOVE_SHIVAN))).toBe(onlyAlert(plan));
  });

  it('shows a refused move from a stacked card inside that card’s list item', async () => {
    const { fixture, plan } = await openPlanOf();
    toggleButton(plan, 'Stacks')!.click();
    await fixture.whenStable();

    button(plan, MOVE_SHIVAN)!.click();
    await refused(fixture, SHIVAN_URL);

    expect(alertIn(itemOf(plan, MOVE_SHIVAN))).toBe(onlyAlert(plan));
  });

  it('shows a failed Remove inside that line’s list item', async () => {
    const withUnpicked = planOf({ mainboard: [planned(brightclimb), unpicked(shivan)] });
    const { fixture, plan } = await openPlanOf(withUnpicked);
    const remove = 'Remove Shivan Dragon from your deck';

    button(plan, remove)!.click();
    await refused(fixture, SHIVAN_URL, withUnpicked, null, serverError);

    expect(text(onlyAlert(plan))).toBe("Couldn't change your deck. Try again in a moment.");
    expect(alertIn(itemOf(plan, remove))).toBe(onlyAlert(plan));
  });

  it('shows a failed Dismiss of the Deck notice after that notice, before the Ready notice', async () => {
    const { fixture, plan } = await openPlanOf(withLost);

    button(deckNotice(plan)!, 'Dismiss')!.click();
    await refused(fixture, NOTICE_URL, withLost, null, serverError);

    const alert = onlyAlert(plan);
    expect(comesBefore(statusIn(plan, { name: DECK_NOTICE })!, alert)).toBe(true);
    expect(statusIn(plan, { name: DECK_NOTICE })!.contains(alert)).toBe(false);
    expect(comesBefore(alert, statusIn(plan, { name: READY_NOTICE })!)).toBe(true);
  });

  it('clears the reason a change was refused once one is made', async () => {
    const { fixture, plan } = await openPlanOf(withLost);
    button(plan, 'Move Lightning Bolt to the sideboard')!.click();
    await refused(fixture, '/api/drafts/draft-1/plan/bolt-card', withLost);
    await vi.waitFor(() => expect(alertIn(plan)).not.toBeNull());

    // A failure from another place takes its place: only one shows.
    button(deckNotice(plan)!, 'Dismiss')!.click();
    await refused(fixture, NOTICE_URL, withLost, null, serverError);
    expect(comesBefore(onlyAlert(plan), statusIn(plan, { name: READY_NOTICE })!)).toBe(true);

    button(plan, 'Move Lightning Bolt to the sideboard')!.click();
    http.expectOne('/api/drafts/draft-1/plan/bolt-card').flush(
      planOf({
        mainboard: [planned(brightclimb), planned(boltAgain)],
        sideboard: [planned(bolt)],
        lost: withLost.lost,
      }),
    );
    await fixture.whenStable();

    expect(alertIn(plan)).toBeNull();
  });
});
