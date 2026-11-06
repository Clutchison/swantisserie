import { answer, openDialog, question } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  alice,
  bob,
  button,
  group,
  http,
  text,
  useDraftsApp,
  type AppFixture,
} from './harness';
import {
  answerChange,
  carol,
  completed,
  dave,
  forfeited,
  gridCell,
  gridCellName,
  unreportedMatch,
  openPlaying,
  playing,
  pushTournament,
  reported,
  resultsGrid,
  singleEliminationFinal,
  swissPlaying,
  swissRoundsWith,
  threePlayers,
  withDrops,
} from './play-tab-harness';

useDraftsApp();

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
    const after = playing([reported(unreportedMatch('m1', bob.id, carol.id), [1, 2], alice.id)]);
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

  it('keeps the dialog open when another match changes, and closes it once its match does', async () => {
    const bobBeatAlice = reported(unreportedMatch('m2', alice.id, bob.id), [1, 2], bob.id);
    const { fixture, tab } = await openPlaying(playing(), { user: dave, powers: ORGANIZE_ONLY });
    await openCell(fixture, tab, 'Bob', 'Carol', 'Bob vs Carol');

    await pushTournament(fixture, playing([bobBeatAlice]), 1);
    expect(group(openDialog()!, 'Game score of Bob vs Carol')).not.toBeNull();

    await pushTournament(
      fixture,
      playing([bobBeatAlice, reported(unreportedMatch('m1', bob.id, carol.id), [2, 0])]),
      2,
    );
    await vi.waitFor(() => expect(openDialog()).toBeNull());
  });

  it('closes the dialog once one of its match’s players drops, changing what clearing it leaves', async () => {
    const bobBeatCarol = reported(unreportedMatch('m1', bob.id, carol.id), [2, 0]);
    const { fixture, tab } = await openPlaying(playing([bobBeatCarol]), {
      user: dave,
      powers: ORGANIZE_ONLY,
    });
    await openCell(fixture, tab, 'Bob', 'Carol', 'Bob vs Carol');

    await pushTournament(
      fixture,
      withDrops(
        [carol.id],
        [bobBeatCarol, forfeited(unreportedMatch('m3', carol.id, alice.id), carol.id)],
      ),
      1,
    );

    await vi.waitFor(() => expect(openDialog()).toBeNull());
  });

  it('closes the dialog once the tournament is complete', async () => {
    const { fixture, tab } = await openPlaying(playing(), { user: dave, powers: ORGANIZE_ONLY });
    await openCell(fixture, tab, 'Bob', 'Carol', 'Bob vs Carol');

    await pushTournament(fixture, completed(playing()), 1);

    await vi.waitFor(() => expect(openDialog()).toBeNull());
  });

  it('sends nothing when the organizer cancels the dialog', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    await answer(await openCell(fixture, tab, 'Alice', 'Bob', 'Alice vs Bob'), 'Cancel');
    await fixture.whenStable();

    http.expectNone('/api/drafts/draft-1/tournament/matches/m2/game-score');
  });

  it('lets an organizer clear a reported match once they go ahead', async () => {
    const m1 = reported(unreportedMatch('m1', bob.id, carol.id), [2, 0]);
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
    const m1 = reported(unreportedMatch('m1', bob.id, carol.id), [2, 0]);
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
    const m3 = reported(unreportedMatch('m3', carol.id, alice.id), [0, 2], alice.id);
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
    const m3 = forfeited(unreportedMatch('m3', carol.id, alice.id), carol.id);
    const { fixture, tab } = await openPlaying(withDrops([carol.id], [m3]), {
      powers: ORGANIZE_ONLY,
    });

    const dialog = await openCell(fixture, tab, 'Carol', 'Alice', 'Carol vs Alice');

    expect(button(group(dialog, 'Game score of Carol vs Alice')!, 'Carol won 2–0')).toBeDefined();
    expect(button(dialog, 'Clear game score')).toBeUndefined();
    await answer(dialog, 'Cancel');
  });

  it('offers no correction of a complete tournament’s matches', async () => {
    const m1 = reported(unreportedMatch('m1', bob.id, carol.id), [2, 0]);
    const { tab } = await openPlaying(completed(playing([m1], { trophyHolders: [bob.id] })), {
      powers: ORGANIZE_ONLY,
    });

    expect(resultsGrid(tab)!.querySelector('button')).toBeNull();
  });

  it('offers no correction of a completed tournament round’s matches, only of the open round’s', async () => {
    const { tab } = await openPlaying(swissPlaying(), { powers: ORGANIZE_ONLY });

    expect(button(tab, 'Correct Carol vs Bob')).toBeUndefined();
    expect(button(tab, 'Report Alice vs Carol')).toBeDefined();
  });

  describe('follow which tournament rounds the read says are correctable, not the last completed round', () => {
    it('in the Swiss list of matches', async () => {
      const [first, second] = swissPlaying().rounds;
      const { tab } = await openPlaying(
        swissPlaying({
          lastCompletedRound: 1,
          rounds: [
            { ...first, correctable: true },
            { ...second, correctable: false },
          ],
        }),
        { powers: ORGANIZE_ONLY },
      );

      expect(button(tab, 'Correct Carol vs Bob')).toBeDefined();
      expect(button(tab, 'Report Alice vs Carol')).toBeUndefined();
    });

    it('in the single elimination bracket', async () => {
      const [first, second] = singleEliminationFinal.rounds;
      const { tab } = await openPlaying(
        {
          ...singleEliminationFinal,
          rounds: [
            { ...first, correctable: true },
            { ...second, correctable: false },
          ],
        },
        { powers: ORGANIZE_ONLY },
      );

      expect(button(tab, 'Correct Bob vs Carol')).toBeDefined();
      expect(button(tab, 'Report Alice vs Carol')).toBeUndefined();
    });

    it('in the round robin results grid', async () => {
      const [round] = playing().rounds;
      const { tab } = await openPlaying(
        playing([], { rounds: [{ ...round, correctable: false }] }),
        { powers: ORGANIZE_ONLY },
      );

      expect(gridCellName(tab, 'Bob', 'Carol')).toBe('Bob against Carol: unreported');
      expect(button(tab, 'Bob against Carol: unreported')).toBeUndefined();
    });
  });

  describe('an open correction in the list of matches', () => {
    /** Opens the Swiss tournament for Dave, an organizer, with Alice and Carol's game scores open. */
    async function openCorrection() {
      const opened = await openPlaying(swissPlaying(), { user: dave, powers: ORGANIZE_ONLY });
      button(opened.tab, 'Report Alice vs Carol')!.click();
      await opened.fixture.whenStable();
      expect(scores(opened.tab)).not.toBeNull();
      return opened;
    }
    const scores = (tab: HTMLElement) => group(tab, 'Game score of Alice vs Carol');
    const aliceVsCarol = unreportedMatch('m2', alice.id, carol.id);

    it('stays open when another match changes, and closes once that match is reported', async () => {
      const { fixture, tab } = await openCorrection();

      await pushTournament(
        fixture,
        swissPlaying({
          rounds: swissRoundsWith(aliceVsCarol, {
            ...reported(unreportedMatch('m1', carol.id, bob.id), [2, 0], carol.id),
            confirmed: true,
          }),
        }),
        1,
      );
      expect(scores(tab)).not.toBeNull();

      await pushTournament(
        fixture,
        swissPlaying({ rounds: swissRoundsWith(reported(aliceVsCarol, [2, 1])) }),
        2,
      );
      expect(scores(tab)).toBeNull();
    });

    it('closes once its tournament round is completed', async () => {
      const { fixture, tab } = await openCorrection();

      await pushTournament(
        fixture,
        swissPlaying({
          lastCompletedRound: 2,
          rounds: swissRoundsWith(aliceVsCarol).map((round) => ({ ...round, correctable: false })),
        }),
        1,
      );

      expect(scores(tab)).toBeNull();
    });
  });

  it('aren’t offered to anyone without the power to organize the draft', async () => {
    const m1 = reported(unreportedMatch('m1', bob.id, carol.id), [2, 0]);
    const { tab } = await openPlaying(playing([m1]));

    expect(resultsGrid(tab)!.querySelector('button')).toBeNull();
  });
});
