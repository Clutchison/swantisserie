import { answer, question } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  alice,
  bob,
  button,
  group,
  http,
  panel,
  text,
  useDraftsApp,
  type AppFixture,
} from './harness';
import {
  answerChange,
  carol,
  dave,
  forfeited,
  gridCell,
  gridCellName,
  openMatch,
  openPlaying,
  playing,
  reported,
  resultsGrid,
  swissPlaying,
  threePlayers,
  withDrops,
  yourMatches,
} from './play-tab-harness';

useDraftsApp();

/** Bob reporting that he beat Alice 2–1 in match m2. */
const bobBeatAlice = reported(openMatch('m2', alice.id, bob.id), [1, 2], bob.id);

describe('confirming a match', () => {
  it('lets the opponent confirm once the tournament is complete', async () => {
    const complete = (m2: ReturnType<typeof openMatch>) =>
      playing([m2], { state: 'Complete', trophyHolders: [bob.id] });
    const { fixture, tab } = await openPlaying(complete(bobBeatAlice));

    button(tab, 'Confirm your match against Bob')!.click();
    await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m2/confirm',
      'POST',
      complete({ ...bobBeatAlice, confirmed: true }),
      1,
      threePlayers,
    );

    expect(yourMatches(tab)).toContain('vs Bob · Lost 1–2 · Confirmed');
    expect(text(gridCell(tab, 'Bob', 'Alice'))).toBe('2–1');
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

  it('is offered from the list of matches in Swiss', async () => {
    const m2 = reported(openMatch('m2', alice.id, carol.id), [1, 2], carol.id);
    const { tab } = await openPlaying(
      swissPlaying({
        rounds: [swissPlaying().rounds[0], { round: 2, matches: [m2], byes: [bob.id] }],
      }),
    );

    expect(button(tab, 'Confirm your match against Carol')).toBeDefined();
  });
});

describe('organizer reports, corrections and clears', () => {
  /** Opens the match of the results grid's cell of `row` against `column`, and answers with its dialog. */
  async function openCell(
    fixture: AppFixture,
    tab: HTMLElement,
    row: string,
    column: string,
    match: string,
  ) {
    gridCell(tab, row, column)!.querySelector('button')!.click();
    await fixture.whenStable();
    return question(match);
  }

  it('lets an organizer report a match from either of its cells, the other cell showing it from its side', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    const dialog = await openCell(fixture, tab, 'Carol', 'Bob', 'Bob vs Carol');
    button(group(dialog, 'Game score of Bob vs Carol')!, 'Carol won 2–1')!.click();
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
    expect(text(gridCell(tab, 'Carol', 'Bob'))).toBe('2–1?');
    expect(text(gridCell(tab, 'Bob', 'Carol'))).toBe('1–2?');
  });

  it('opens the same match from the other cell', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    const dialog = await openCell(fixture, tab, 'Bob', 'Carol', 'Bob vs Carol');
    button(group(dialog, 'Game score of Bob vs Carol')!, 'Bob won 2–0')!.click();
    const req = await vi.waitFor(() =>
      http.expectOne('/api/drafts/draft-1/tournament/matches/m1/game-score'),
    );

    expect(req.request.body).toEqual({ games: [2, 0] });
  });

  it('sends nothing when the organizer cancels the dialog', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    await answer(await openCell(fixture, tab, 'Alice', 'Bob', 'Alice vs Bob'), 'Cancel');
    await fixture.whenStable();

    http.expectNone('/api/drafts/draft-1/tournament/matches/m2/game-score');
  });

  it('lets an organizer clear a reported match once they go ahead', async () => {
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { fixture, tab } = await openPlaying(playing([m1]), { powers: ORGANIZE_ONLY });

    button(
      await openCell(fixture, tab, 'Bob', 'Carol', 'Bob vs Carol'),
      'Clear game score',
    )!.click();
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

    expect(gridCellName(tab, 'Bob', 'Carol')).toBe('Bob against Carol: unreported');
  });

  it('sends nothing when the organizer thinks better of clearing', async () => {
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { fixture, tab } = await openPlaying(playing([m1]), { powers: ORGANIZE_ONLY });

    button(
      await openCell(fixture, tab, 'Bob', 'Carol', 'Bob vs Carol'),
      'Clear game score',
    )!.click();
    await answer(await question('Clear the game score of Bob vs Carol?'), 'Cancel');
    await fixture.whenStable();

    http.expectNone('/api/drafts/draft-1/tournament/matches/m1/game-score');
  });

  it('offers Clear game score only for a match with a game score', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    const dialog = await openCell(fixture, tab, 'Bob', 'Carol', 'Bob vs Carol');

    expect(button(dialog, 'Clear game score')).toBeUndefined();
    await answer(dialog, 'Cancel');
  });

  it('says clearing a match against a dropped player makes it their forfeit', async () => {
    const m3 = reported(openMatch('m3', carol.id, alice.id), [0, 2], alice.id);
    const { fixture, tab } = await openPlaying(withDrops([carol.id], [m3]), {
      powers: ORGANIZE_ONLY,
    });

    button(
      await openCell(fixture, tab, 'Alice', 'Carol', 'Carol vs Alice'),
      'Clear game score',
    )!.click();

    const dialog = await question('Clear the game score of Carol vs Alice?');
    expect(dialog.textContent).toContain('It will become a forfeit by Carol, who has dropped.');
    await answer(dialog, 'Cancel');
  });

  it('offers no Clear game score for a dropped player’s forfeit while the tournament is playing', async () => {
    const m3 = forfeited(openMatch('m3', carol.id, alice.id), carol.id);
    const { fixture, tab } = await openPlaying(withDrops([carol.id], [m3]), {
      powers: ORGANIZE_ONLY,
    });

    const dialog = await openCell(fixture, tab, 'Carol', 'Alice', 'Carol vs Alice');

    expect(button(group(dialog, 'Game score of Carol vs Alice')!, 'Carol won 2–0')).toBeDefined();
    expect(button(dialog, 'Clear game score')).toBeUndefined();
    await answer(dialog, 'Cancel');
  });

  it('offers no correction of a complete tournament’s matches', async () => {
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { tab } = await openPlaying(
      playing([m1], { state: 'Complete', trophyHolders: [bob.id] }),
      { powers: ORGANIZE_ONLY },
    );

    expect(resultsGrid(tab)!.querySelector('button')).toBeNull();
  });

  it('offers no correction of a completed tournament round’s matches, only of the open round’s', async () => {
    const { tab } = await openPlaying(swissPlaying(), { powers: ORGANIZE_ONLY });

    expect(button(tab, 'Correct Carol vs Bob')).toBeUndefined();
    expect(button(tab, 'Report Alice vs Carol')).toBeDefined();
  });

  it('aren’t offered to anyone without the power to organize the draft', async () => {
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { tab } = await openPlaying(playing([m1]));

    expect(resultsGrid(tab)!.querySelector('button')).toBeNull();
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
