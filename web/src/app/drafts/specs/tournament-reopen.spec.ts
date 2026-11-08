import { answer, question } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  bob,
  button,
  findNamedList,
  http,
  panel,
  text,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  carol,
  dave,
  failChange,
  unreportedMatch,
  openPlaying,
  swissPlaying,
  threePlayers,
} from './play-tab-harness';

useDraftsApp();

/** The Swiss tournament with round 1 reopened: Carol v Bob (m1) can be corrected again. */
const reopened = swissPlaying({
  lastCompletedRound: 0,
  rounds: [{ ...swissPlaying().rounds[0], correctable: true }],
  reopenRound: null,
});

describe('reopening a tournament round', () => {
  it('lets an organizer reopen the last completed round once they go ahead, which unlocks its results', async () => {
    const { fixture, page, tab } = await openPlaying(swissPlaying(), { powers: ORGANIZE_ONLY });
    expect(button(tab, 'Correct Carol vs Bob')).toBeUndefined();

    button(tab, 'Reopen round 1')!.click();
    const dialog = await question('Reopen tournament round 1?');
    // Nothing follows the detail but the dialog's buttons: it takes back no drops.
    expect(text(dialog)).toContain(
      'Its results will be open to correction again, and will leave the standings until it is completed again. Reopening it will remove tournament round 2’s pairings, to be paired again then. Cancel',
    );
    await answer(dialog, 'Reopen round 1');
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/reopen-round',
      'POST',
      reopened,
      1,
      threePlayers,
    );

    expect(req.request.body).toBeNull();
    expect(button(panel(page), 'Correct Carol vs Bob')).toBeDefined();
    expect(findNamedList(panel(page), 'Tournament round 2')).toBeNull();
  });

  it.each([
    [[bob.id], 'Bob will be back in the tournament, with their drop taken back.'],
    [
      [bob.id, carol.id],
      'Bob and Carol will be back in the tournament, with their drops taken back.',
    ],
  ])('lists the players whose drops it takes back: %j', async (takesBackDrops, back) => {
    const { tab } = await openPlaying(
      swissPlaying({
        entries: swissPlaying().entries.map((entry) => ({
          ...entry,
          dropped: takesBackDrops.includes(entry.playerId),
        })),
        reopenRound: { round: 1, refusal: null, takesBackDrops },
      }),
      { powers: ORGANIZE_ONLY },
    );

    button(tab, 'Reopen round 1')!.click();
    const dialog = await question('Reopen tournament round 1?');

    expect(text(dialog)).toContain(`to be paired again then. ${back}`);
    await answer(dialog, 'Cancel');
  });

  it('sends nothing when the organizer thinks better of it', async () => {
    const { fixture, tab } = await openPlaying(swissPlaying(), { powers: ORGANIZE_ONLY });

    button(tab, 'Reopen round 1')!.click();
    await answer(await question('Reopen tournament round 1?'), 'Cancel');
    await fixture.whenStable();

    http.expectNone('/api/drafts/draft-1/tournament/reopen-round');
  });

  it('says reopening failed when the api gives no reason', async () => {
    const { fixture, page, tab } = await openPlaying(swissPlaying(), { powers: ORGANIZE_ONLY });

    button(tab, 'Reopen round 1')!.click();
    await answer(await question('Reopen tournament round 1?'), 'Reopen round 1');

    expect(await failChange(fixture, page, '/api/drafts/draft-1/tournament/reopen-round')).toBe(
      "Couldn't reopen the tournament round. Try again in a moment.",
    );
  });

  it('is disabled, saying why, when the api would refuse it', async () => {
    const message =
      'Tournament round 2 has a match with a game score. Clear it before reopening tournament round 1.';
    const { tab } = await openPlaying(
      swissPlaying({
        reopenRound: {
          round: 1,
          refusal: { error: 'next-round-reported', message },
          takesBackDrops: [],
        },
      }),
      { powers: ORGANIZE_ONLY },
    );

    const reopenRound = button(tab, 'Reopen round 1')!;
    expect(reopenRound.disabled).toBe(true);
    expect(reopenRound.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(reopenRound.getAttribute('aria-describedby')!)?.textContent,
    ).toBe(message);
  });

  it('isn’t offered to anyone without the power to organize the draft', async () => {
    const { tab } = await openPlaying(swissPlaying(), { user: dave });

    expect(button(tab, 'Reopen round 1')).toBeUndefined();
  });

  it('isn’t offered when the read offers no Reopen round, as before any round is completed', async () => {
    const { tab } = await openPlaying(
      swissPlaying({
        lastCompletedRound: 0,
        rounds: [
          {
            round: 1,
            correctable: true,
            matches: [unreportedMatch('m1', bob.id, carol.id)],
            byes: [],
          },
        ],
        reopenRound: null,
      }),
      { powers: ORGANIZE_ONLY },
    );

    expect(tab.textContent).not.toContain('Reopen round');
  });
});
