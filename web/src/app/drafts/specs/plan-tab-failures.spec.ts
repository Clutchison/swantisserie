import type { PlanView } from 'contract';
import {
  useDraftsApp,
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
import { alertIn, comesBefore, onlyAlert, serverError, statusIn } from '../../specs-harness';
import { useTallScreen, brightclimb } from './pool-tab-harness';
import {
  bobsTurn,
  bolt,
  boltAgain,
  cards,
  expectByTools,
  expectInItemOf,
  planned,
  planOf,
  openPlan,
  planBoards,
  READY_NOTICE,
  notInPlan,
  conflict,
} from './plan-tab-harness';

useDraftsApp();
useTallScreen();

const SHIVAN_URL = '/api/drafts/draft-1/plan/shivan-card';
const READY_NOTICE_URL = '/api/drafts/draft-1/plan/ready-notice';
const MOVE_SHIVAN = 'Move Shivan Dragon to the sideboard';
/** A plan whose Ready notice shows. */
const withReadyNotice = planOf({
  mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
  readyNotice: true,
});

/** Opens the Deck tab of a drafting draft on Bob's turn, the plan `plan`. */
async function openPlanOf(plan = planOf()) {
  const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
    cards,
    plan,
  });
  return { fixture, plan: await openPlan(fixture, page) };
}

/**
 * Fails the change sent to `url`, answering it with `answer` and `init` (by
 * default a refusal, the card no longer in the plan), then the plan's re-read
 * with `reread`.
 */
async function failed(
  fixture: AppFixture,
  url: string,
  {
    reread = planOf(),
    answer = notInPlan,
    init = conflict,
  }: { reread?: PlanView; answer?: object | null; init?: typeof conflict } = {},
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
    await failed(fixture, SHIVAN_URL);

    expect(text(onlyAlert(plan))).toBe('That card isn’t in your deck.');
    expectInItemOf(plan, MOVE_SHIVAN);
  });

  it('shows a refused move from a stacked card inside that card’s list item', async () => {
    const { fixture, plan } = await openPlanOf();
    toggleButton(plan, 'Stacks')!.click();
    await fixture.whenStable();

    button(plan, MOVE_SHIVAN)!.click();
    await failed(fixture, SHIVAN_URL);

    expectInItemOf(plan, MOVE_SHIVAN);
  });

  it('shows a failed Remove inside that line’s list item', async () => {
    const withForest = planOf({
      mainboard: [planned(brightclimb)],
      basics: [{ land: 'Forest', board: 'Mainboard', count: 1 }],
    });
    const { fixture, plan } = await openPlanOf(withForest);
    const remove = 'Remove Forest from your deck';

    button(plan, remove)!.click();
    await failed(fixture, '/api/drafts/draft-1/plan/basics/Forest/Mainboard', {
      reread: withForest,
      answer: null,
      init: serverError,
    });

    expect(text(onlyAlert(plan))).toBe("Couldn't change your deck. Try again in a moment.");
    expectInItemOf(plan, remove);
  });

  it('clears the reason a change was refused once one is made', async () => {
    const { fixture, plan } = await openPlanOf(withReadyNotice);
    button(plan, 'Move Lightning Bolt to the sideboard')!.click();
    await failed(fixture, '/api/drafts/draft-1/plan/bolt-card', { reread: withReadyNotice });
    await vi.waitFor(() => expect(alertIn(plan)).not.toBeNull());

    // A failure from another place takes its place: only one shows.
    button(plan, 'Dismiss')!.click();
    await failed(fixture, READY_NOTICE_URL, {
      reread: withReadyNotice,
      answer: null,
      init: serverError,
    });
    expect(comesBefore(statusIn(plan, { name: READY_NOTICE })!, onlyAlert(plan))).toBe(true);

    button(plan, 'Move Lightning Bolt to the sideboard')!.click();
    http.expectOne('/api/drafts/draft-1/plan/bolt-card').flush(
      planOf({
        mainboard: [planned(brightclimb), planned(boltAgain)],
        sideboard: [planned(bolt)],
        readyNotice: true,
      }),
    );
    await fixture.whenStable();

    expect(alertIn(plan)).toBeNull();
  });
});
