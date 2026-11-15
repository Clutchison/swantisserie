import { answer, question } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  accessibleDescription,
  alertIn,
  alice,
  bob,
  button,
  http,
  panel,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  carol,
  dave,
  failChange,
  forfeited,
  gridCellName,
  unreportedMatch,
  openPlaying,
  playerLines,
  playing,
  reported,
  threePlayers,
  withDrops,
  yourMatches,
  completed,
  entry,
  pushTournament,
  signedIn,
  swissPlaying,
} from './play-tab-harness';
import { expectInRow } from './play-tab-placement-harness';

useDraftsApp();

/** The drop of the player `playerId`, which Drop and Drop from tournament send and Reinstate deletes. */
const dropUrl = (playerId: string) => `/api/drafts/draft-1/tournament/entries/${playerId}/drop`;

/** Carol dropped, after beating Bob: her match against Alice (m3) is a forfeit. */
const carolDropped = withDrops(
  [carol.id],
  [
    reported(unreportedMatch('m1', bob.id, carol.id), [0, 2], carol.id),
    forfeited(unreportedMatch('m3', carol.id, alice.id), carol.id),
  ],
);

/** Why the api refuses reinstating Bob in `bobDroppedAndPassed`. */
const pairedWithoutBob =
  'That player can’t be reinstated: tournament round 2 was paired after they dropped.';

/** The Swiss tournament's round 1, Bob having dropped from his match against Carol (m1) while Alice had a bye. */
const bobDroppedSwiss = swissPlaying({
  lastCompletedRound: 0,
  entries: [alice.id, bob.id, carol.id].map((id) => entry(id, { dropped: id === bob.id })),
  rounds: [
    {
      round: 1,
      correctable: true,
      matches: [forfeited(unreportedMatch('m1', carol.id, bob.id), bob.id)],
      byes: [alice.id],
    },
  ],
  reopenRound: null,
});

/** `bobDroppedSwiss` once round 1 is completed and round 2 paired without Bob, so the api refuses reinstating him. */
const bobDroppedAndPassed = swissPlaying({
  entries: [alice.id, bob.id, carol.id].map((id) =>
    id === bob.id
      ? entry(id, {
          dropped: true,
          reinstateRefusal: { error: 'paired-since-drop', message: pairedWithoutBob },
        })
      : entry(id),
  ),
  rounds: [
    { ...bobDroppedSwiss.rounds[0], correctable: false },
    { round: 2, correctable: true, matches: [unreportedMatch('m2', alice.id, carol.id)], byes: [] },
  ],
});

describe('drops on the Play tab', () => {
  it('lets a player drop from the tournament once they go ahead', async () => {
    const { fixture, page, tab } = await openPlaying(playing());

    button(tab, 'Drop from tournament')!.click();
    const dialog = await question('Drop from the tournament?');
    expect(dialog.textContent).toContain(
      'Your unplayed matches become forfeits, and only an organizer can reinstate you. Your deck stays locked until the tournament is complete or cancelled.',
    );
    await answer(dialog, 'Drop');
    await answerChange(
      fixture,
      dropUrl(alice.id),
      'POST',
      withDrops(
        [alice.id],
        [
          forfeited(unreportedMatch('m2', alice.id, bob.id), alice.id),
          forfeited(unreportedMatch('m3', carol.id, alice.id), alice.id),
        ],
      ),
      1,
      threePlayers,
    );

    expect(playerLines(panel(page))).toEqual(['Alice · Dropped', 'Bob', 'Carol']);
    expect(button(panel(page), 'Drop from tournament')).toBeUndefined();
    expect(yourMatches(panel(page))).toEqual([
      'Forfeit: you dropped against Bob',
      'Forfeit: you dropped against Carol',
    ]);
    expect(button(panel(page), 'Report your match against Bob')).toBeUndefined();
  });

  it('sends nothing when the player thinks better of dropping', async () => {
    const { fixture, tab } = await openPlaying(playing());

    button(tab, 'Drop from tournament')!.click();
    await answer(await question('Drop from the tournament?'), 'Cancel');
    await fixture.whenStable();

    http.expectNone(dropUrl(alice.id));

    expect(button(tab, 'Drop from tournament')).toBeDefined();
  });

  it('offers a player no Drop for anyone else, nor Reinstate', async () => {
    const { tab } = await openPlaying(carolDropped);

    expect(button(tab, 'Drop from tournament')).toBeDefined();
    expect(button(tab, 'Drop Bob')).toBeUndefined();
    expect(button(tab, 'Reinstate Carol')).toBeUndefined();
  });

  it('offers Drop to a player who plays on after a player who joined before them dropped', async () => {
    const { tab } = await openPlaying(withDrops([alice.id]), { user: signedIn(bob) });

    expect(button(tab, 'Drop from tournament')).toBeDefined();
  });

  it('offers a viewer who didn’t join no Drop', async () => {
    const { tab } = await openPlaying(carolDropped, { user: dave });

    expect(button(tab, 'Drop from tournament')).toBeUndefined();
  });

  it('lets an organizer drop a player once they go ahead', async () => {
    const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Drop Bob')!.click();
    const dialog = await question('Drop Bob from the tournament?');
    expect(dialog.textContent).toContain('Their unplayed matches become forfeits.');
    await answer(dialog, 'Drop');
    await answerChange(fixture, dropUrl(bob.id), 'POST', withDrops([bob.id]), 1, threePlayers);

    expect(playerLines(panel(page))).toContain('Bob · Dropped');
    expect(button(panel(page), 'Reinstate Bob')).toBeDefined();
  });

  it('keeps a player the organizer thinks better of dropping', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Drop Bob')!.click();
    await answer(await question('Drop Bob from the tournament?'), 'Cancel');
    await fixture.whenStable();

    http.expectNone(dropUrl(bob.id));
    expect(button(tab, 'Drop Bob')).toBeDefined();
  });

  it('lets an organizer reinstate a dropped player', async () => {
    const { fixture, page, tab } = await openPlaying(carolDropped, { powers: ORGANIZE_ONLY });
    expect(button(tab, 'Drop Carol')).toBeUndefined();
    expect(button(tab, 'Reinstate Carol')!.disabled).toBe(false);

    button(tab, 'Reinstate Carol')!.click();
    await answerChange(
      fixture,
      dropUrl(carol.id),
      'DELETE',
      playing([reported(unreportedMatch('m1', bob.id, carol.id), [0, 2], carol.id)]),
      1,
      threePlayers,
    );

    expect(playerLines(panel(page))).toEqual(['Alice', 'Bob', 'Carol']);
    expect(gridCellName(panel(page), 'Alice', 'Carol')).toBe('Alice against Carol: unreported');
    expect(yourMatches(panel(page))).toContain('vs Carol');
  });

  it('offers Reinstate disabled, saying why, when the api would refuse it', async () => {
    const { tab } = await openPlaying(bobDroppedAndPassed, { powers: ORGANIZE_ONLY });

    const reinstate = button(tab, 'Reinstate Bob')!;
    expect(reinstate.disabled).toBe(true);
    expect(accessibleDescription(reinstate)).toBe(pairedWithoutBob);
    expect(playerLines(tab)).toContain(`Bob · Dropped ${pairedWithoutBob}`);
  });

  it('disables Reinstate as soon as the next tournament round is paired without the player', async () => {
    const { fixture, tab } = await openPlaying(bobDroppedSwiss, { powers: ORGANIZE_ONLY });
    expect(button(tab, 'Reinstate Bob')!.disabled).toBe(false);
    expect(accessibleDescription(button(tab, 'Reinstate Bob')!)).toBe('');

    await pushTournament(fixture, bobDroppedAndPassed, 1, { asPlayer: true });

    await vi.waitFor(() => expect(button(tab, 'Reinstate Bob')!.disabled).toBe(true));
    expect(accessibleDescription(button(tab, 'Reinstate Bob')!)).toBe(pairedWithoutBob);
  });

  it.each([
    [
      'dropping from the tournament',
      playing(),
      {},
      'Drop from tournament',
      ['Drop from the tournament?', 'Drop'],
      dropUrl(alice.id),
      "Couldn't drop from the tournament. Try again in a moment.",
    ],
    [
      'dropping a player',
      playing(),
      { powers: ORGANIZE_ONLY },
      'Drop Bob',
      ['Drop Bob from the tournament?', 'Drop'],
      dropUrl(bob.id),
      "Couldn't drop the player. Try again in a moment.",
    ],
    [
      'reinstating a player',
      carolDropped,
      { powers: ORGANIZE_ONLY },
      'Reinstate Carol',
      null,
      dropUrl(carol.id),
      "Couldn't reinstate the player. Try again in a moment.",
    ],
  ] as const)(
    'says %s failed when the api gives no reason',
    async (_, tournament, options, label, asked, url, failure) => {
      const { fixture, page, tab } = await openPlaying(tournament, options);

      button(tab, label)!.click();
      if (asked) await answer(await question(asked[0]), asked[1]);

      expect(await failChange(fixture, page, url)).toBe(failure);
    },
  );

  it.each([
    ['dropping', playing(), 'Drop Bob', ['Drop Bob from the tournament?', 'Drop'], bob.id],
    ['reinstating', carolDropped, 'Reinstate Carol', null, carol.id],
  ] as const)(
    'says %s a player failed in that player’s row of Players',
    async (_, tournament, label, asked, playerId) => {
      const { fixture, page, tab } = await openPlaying(tournament, { powers: ORGANIZE_ONLY });

      button(tab, label)!.click();
      if (asked) await answer(await question(asked[0]), asked[1]);
      await failChange(fixture, page, dropUrl(playerId));

      expectInRow(page, tab, 'Players', label);
    },
  );

  it('clears a failure in a player’s row once the organizer’s next change goes through', async () => {
    const { fixture, page, tab } = await openPlaying(carolDropped, { powers: ORGANIZE_ONLY });

    button(tab, 'Reinstate Carol')!.click();
    await failChange(fixture, page, dropUrl(carol.id));
    button(tab, 'Drop Bob')!.click();
    await answer(await question('Drop Bob from the tournament?'), 'Drop');
    await answerChange(
      fixture,
      dropUrl(bob.id),
      'POST',
      withDrops([carol.id, bob.id]),
      1,
      threePlayers,
    );

    expect(alertIn(panel(page))).toBeNull();
  });

  it('offers no Drop or Reinstate once the tournament is complete', async () => {
    const { tab } = await openPlaying(completed(carolDropped), { powers: ORGANIZE_ONLY });

    expect(playerLines(tab)).toEqual(['Alice', 'Bob', 'Carol · Dropped']);
    expect(button(tab, 'Drop Bob')).toBeUndefined();
    expect(button(tab, 'Reinstate Carol')).toBeUndefined();
    expect(button(tab, 'Drop from tournament')).toBeUndefined();
  });
});
