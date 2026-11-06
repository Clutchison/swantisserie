import { answer, question } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  alice,
  bob,
  button,
  group,
  http,
  items,
  panel,
  text,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  carol,
  dave,
  forfeited,
  openMatch,
  openPlaying,
  playing,
  reported,
  swissPlaying,
  threePlayers,
  withDrops,
} from './play-tab-harness';

useDraftsApp();

/** Bob reporting that he beat Alice 2–1 in match m2. */
const bobBeatAlice = reported(openMatch('m2', alice.id, bob.id), [1, 2], bob.id);

describe('confirming a match', () => {
  it('lets the opponent of the player who reported it confirm its game score, which then shows as confirmed', async () => {
    const { fixture, page, tab } = await openPlaying(playing([bobBeatAlice]));

    button(tab, 'Confirm your match against Bob')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m2/confirm',
      'POST',
      playing([{ ...bobBeatAlice, confirmed: true }]),
      1,
      threePlayers,
    );

    expect(req.request.body).toBeNull();
    expect(items(panel(page), 'Tournament round 2')[0]).toBe('Alice 1–2 Bob · Confirmed');
    expect(button(panel(page), 'Confirm your match against Bob')).toBeUndefined();
  });

  it('lets the opponent confirm once the tournament is complete', async () => {
    const complete = (m2: ReturnType<typeof openMatch>) =>
      playing([m2], { state: 'Complete', trophyHolders: [bob.id] });
    const { fixture, page, tab } = await openPlaying(complete(bobBeatAlice));

    button(tab, 'Confirm your match against Bob')!.click();
    await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m2/confirm',
      'POST',
      complete({ ...bobBeatAlice, confirmed: true }),
      1,
      threePlayers,
    );

    expect(items(panel(page), 'Tournament round 2')[0]).toBe('Alice 1–2 Bob · Confirmed');
  });

  it('shows a confirmed match as confirmed to everyone', async () => {
    const m1 = { ...reported(openMatch('m1', bob.id, carol.id), [2, 1]), confirmed: true };
    const { tab } = await openPlaying(playing([m1]), { user: dave });

    expect(items(tab, 'Tournament round 1')[0]).toBe('Bob 2–1 Carol · Confirmed');
  });

  it('isn’t offered to the player who reported it, or for a match that isn’t reported', async () => {
    const aliceBeatBob = reported(openMatch('m2', alice.id, bob.id), [2, 0], alice.id);
    const { tab } = await openPlaying(playing([aliceBeatBob]));

    expect(button(tab, 'Confirm your match against Bob')).toBeUndefined();
    expect(button(tab, 'Confirm your match against Carol')).toBeUndefined();
  });

  it('isn’t offered to viewers who aren’t the match’s players', async () => {
    const { tab } = await openPlaying(playing([bobBeatAlice]), { user: dave });

    expect(text(tab)).not.toContain('Confirm');
  });
});

describe('organizer reports, corrections and clears', () => {
  it('lets an organizer report a match for its players', async () => {
    const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Report Bob vs Carol')!.click();
    await fixture.whenStable();
    button(group(tab, 'Game score of Bob vs Carol')!, 'Carol won 2–1')!.click();
    const after = playing([reported(openMatch('m1', bob.id, carol.id), [1, 2], alice.id)]);
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m1/game-score',
      'PUT',
      after,
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ games: [1, 2] });
    expect(items(panel(page), 'Tournament round 1')[0]).toContain('Bob 1–2 Carol');
  });

  it('offers no correction of a complete tournament’s matches', async () => {
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { tab } = await openPlaying(
      playing([m1], { state: 'Complete', trophyHolders: [bob.id] }),
      { powers: ORGANIZE_ONLY },
    );

    expect(button(tab, 'Correct Bob vs Carol')).toBeUndefined();
    expect(button(tab, 'Report Alice vs Bob')).toBeUndefined();
  });

  it('offers no correction of a completed tournament round’s matches, only of the open round’s', async () => {
    const { tab } = await openPlaying(swissPlaying(), { powers: ORGANIZE_ONLY });

    expect(button(tab, 'Correct Carol vs Bob')).toBeUndefined();
    expect(button(tab, 'Report Alice vs Carol')).toBeDefined();
  });

  it('lets an organizer clear a reported match once they go ahead', async () => {
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { fixture, page, tab } = await openPlaying(playing([m1]), { powers: ORGANIZE_ONLY });

    button(tab, 'Correct Bob vs Carol')!.click();
    await fixture.whenStable();
    button(group(tab, 'Game score of Bob vs Carol')!, 'Clear game score')!.click();
    const dialog = await question('Clear the game score of Bob vs Carol?');
    expect(dialog.textContent).toContain('The match will be unreported again.');
    await answer(dialog, 'Clear');
    await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m1/game-score',
      'DELETE',
      playing(),
      1,
      threePlayers,
    );

    expect(items(panel(page), 'Tournament round 1')[0]).toContain('Bob vs Carol · Unreported');
    expect(button(panel(page), 'Report Bob vs Carol')).toBeDefined();
  });

  it('sends nothing when the organizer thinks better of clearing', async () => {
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { fixture, tab } = await openPlaying(playing([m1]), { powers: ORGANIZE_ONLY });

    button(tab, 'Correct Bob vs Carol')!.click();
    await fixture.whenStable();
    button(group(tab, 'Game score of Bob vs Carol')!, 'Clear game score')!.click();
    await answer(await question('Clear the game score of Bob vs Carol?'), 'Cancel');
    await fixture.whenStable();

    http.expectNone('/api/drafts/draft-1/tournament/matches/m1/game-score');
  });

  it('offers Clear game score only for a match with a game score', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Report Bob vs Carol')!.click();
    await fixture.whenStable();

    expect(button(group(tab, 'Game score of Bob vs Carol')!, 'Clear game score')).toBeUndefined();
  });

  it('says clearing a match against a dropped player makes it their forfeit', async () => {
    const m3 = reported(openMatch('m3', carol.id, alice.id), [0, 2], alice.id);
    const { fixture, tab } = await openPlaying(withDrops([carol.id], [m3]), {
      powers: ORGANIZE_ONLY,
    });

    button(tab, 'Correct Carol vs Alice')!.click();
    await fixture.whenStable();
    button(group(tab, 'Game score of Carol vs Alice')!, 'Clear game score')!.click();

    const dialog = await question('Clear the game score of Carol vs Alice?');
    expect(dialog.textContent).toContain('It will become a forfeit by Carol, who has dropped.');
    await answer(dialog, 'Cancel');
  });

  it('offers no Clear game score for a dropped player’s forfeit while the tournament is playing', async () => {
    const m3 = forfeited(openMatch('m3', carol.id, alice.id), carol.id);
    const { fixture, tab } = await openPlaying(withDrops([carol.id], [m3]), {
      powers: ORGANIZE_ONLY,
    });

    button(tab, 'Correct Carol vs Alice')!.click();
    await fixture.whenStable();

    expect(button(group(tab, 'Game score of Carol vs Alice')!, 'Carol won 2–0')).toBeDefined();
    expect(button(group(tab, 'Game score of Carol vs Alice')!, 'Clear game score')).toBeUndefined();
  });

  it('aren’t offered to anyone without the power to organize the draft', async () => {
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { tab } = await openPlaying(playing([m1]));

    expect(button(tab, 'Correct Bob vs Carol')).toBeUndefined();
    expect(button(tab, 'Report Alice vs Bob')).toBeUndefined();
  });
});

describe('cancelling a tournament being played', () => {
  it('lets an organizer cancel it once they go ahead, offering setup again', async () => {
    const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Cancel tournament')!.click();
    const dialog = await question('Cancel the tournament?');
    expect(dialog.textContent).toContain(
      'Its matches are removed, nothing from it counts, and every deck unlocks.',
    );
    await answer(dialog, 'Cancel tournament');
    await answerChange(fixture, '/api/drafts/draft-1/tournament', 'DELETE', null, 1, threePlayers);

    expect(button(panel(page), 'Set up tournament')).toBeDefined();
  });

  it('keeps it playing when the organizer thinks better of cancelling', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Cancel tournament')!.click();
    await answer(await question('Cancel the tournament?'), 'Keep tournament');
    await fixture.whenStable();

    http.expectNone('/api/drafts/draft-1/tournament');
    expect(button(tab, 'Cancel tournament')).toBeDefined();
  });

  it('isn’t offered once the tournament is complete', async () => {
    const { tab } = await openPlaying(playing([], { state: 'Complete' }), {
      powers: ORGANIZE_ONLY,
    });

    expect(button(tab, 'Cancel tournament')).toBeUndefined();
  });

  it('isn’t offered to anyone without the power to organize the draft', async () => {
    const { tab } = await openPlaying(playing());

    expect(button(tab, 'Cancel tournament')).toBeUndefined();
  });
});
