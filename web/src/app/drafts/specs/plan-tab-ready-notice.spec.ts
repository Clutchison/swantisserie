import { emptyStatusIn, expectFocusOn, statusIn, watchChanges } from '../../specs-harness';
import { alice, bob, button, http, text, useDraftsApp } from './harness';
import { flushTournament, openComplete, registration } from './play-tab-harness';
import { cards, pressDismiss, openPlan, planOf, readyNotice } from './plan-tab-harness';
import { brightclimb, shivan } from './pool-tab-harness';

useDraftsApp();

const READY_NOTICE_URL = '/api/drafts/draft-1/plan/ready-notice';

/** The tournament in registration, Bob and Alice joined. */
const aliceJoined = registration(bob.id, alice.id);

/** The Deck tab of a complete draft in its tournament's registration, Alice joined, her plan `plan`. */
async function openPlanOf(plan = planOf()) {
  const { fixture, page } = await openComplete(aliceJoined, { cards, plan });
  return { fixture, deck: await openPlan(fixture, page) };
}

describe('the Ready notice on the Deck tab', () => {
  it('tells the player, as a status, that they are no longer ready and why', async () => {
    const { deck } = await openPlanOf(planOf({ readyNotice: true }));

    expect(text(readyNotice(deck)!)).toBe(
      'You’re no longer ready: your mainboard dropped below 40 cards. Fill your deck, then mark yourself ready again on the Play tab. Dismiss',
    );
  });

  it('shows nothing while the plan carries no Ready notice', async () => {
    const { deck } = await openPlanOf();

    expect(readyNotice(deck)).toBeNull();
  });

  it('appears when a deck change’s answer carries it', async () => {
    const { fixture, deck } = await openPlanOf();

    button(deck, 'Move Lightning Bolt to the sideboard')!.click();
    http.expectOne('/api/drafts/draft-1/plan/bolt-card').flush(planOf({ readyNotice: true }));
    await flushTournament(aliceJoined);
    await fixture.whenStable();

    expect(readyNotice(deck)).not.toBeNull();
  });

  it('puts the notice into its region, there and empty while the player is ready, and says it once', async () => {
    const { fixture, deck } = await openPlanOf();
    const region = emptyStatusIn(deck, 'Ready notice');

    button(deck, 'Move Lightning Bolt to the sideboard')!.click();
    http.expectOne('/api/drafts/draft-1/plan/bolt-card').flush(planOf({ readyNotice: true }));
    await flushTournament(aliceJoined);
    await fixture.whenStable();

    expect(statusIn(deck, { name: 'Ready notice' })).toBe(region);
    expect(text(region)).toBe(
      'You’re no longer ready: your mainboard dropped below 40 cards. Fill your deck, then mark yourself ready again on the Play tab. Dismiss',
    );

    // Another deck change answered with the notice still there: the region is left alone.
    const changes = watchChanges(region);
    button(deck, 'Move Shivan Dragon to the sideboard')!.click();
    http.expectOne(`/api/drafts/draft-1/plan/${shivan.id}`).flush(planOf({ readyNotice: true }));
    await flushTournament(aliceJoined);
    await fixture.whenStable();
    expect(changes()).toEqual([]);
  });

  it('sends the dismiss and goes once it is answered', async () => {
    const { fixture, deck } = await openPlanOf(planOf({ readyNotice: true }));

    button(readyNotice(deck)!, 'Dismiss')!.click();
    const req = http.expectOne(READY_NOTICE_URL);
    expect(req.request.method).toBe('DELETE');
    req.flush(planOf());
    await flushTournament(aliceJoined);
    await fixture.whenStable();

    expect(readyNotice(deck)).toBeNull();
  });

  it('moves focus to the nearest control after its Dismiss once the dismiss settles', async () => {
    const { fixture, deck } = await openPlanOf(planOf({ readyNotice: true }));

    await pressDismiss(fixture, readyNotice(deck)!, READY_NOTICE_URL, planOf(), {
      answered: () => flushTournament(aliceJoined),
    });

    await vi.waitFor(() => expectFocusOn(deck, `Move ${brightclimb.name} to the sideboard`));
  });
});
