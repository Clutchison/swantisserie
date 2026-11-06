import type { CorrectionPreview, CorrectionPreviewRequest, ViewerTournamentView } from 'contract';
import { openDialog } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  alice,
  bob,
  button,
  controlByLabel,
  group,
  http,
  items,
  type AppFixture,
  panel,
  text,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  carol,
  openComplete,
  openPlaying,
  openPlayTab,
  registration,
  singleEliminationFinal as final,
  singleEliminationPlaying,
  threePlayers,
} from './play-tab-harness';

useDraftsApp();

/** Opens the Complete round dialog for an organizer, on `tournament`. */
async function openCompleteRound(tournament: ViewerTournamentView) {
  const opened = await openPlaying(tournament, { powers: ORGANIZE_ONLY });
  button(opened.tab, 'Complete round')!.click();
  await opened.fixture.whenStable();
  return opened;
}

describe('single elimination tournaments on the Play tab', () => {
  it('offers single elimination at setup, with no round option', async () => {
    const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });
    const tab = await openPlayTab(fixture, page);

    controlByLabel(tab, 'radio', 'Single elimination')!.click();
    await fixture.whenStable();
    expect(group(tab, 'Swiss round option')).toBeNull();
    button(tab, 'Set up tournament')!.click();
    const req = await answerChange(fixture, '/api/drafts/draft-1/tournament', 'POST', {
      ...registration(alice.id, bob.id, carol.id),
      format: 'SingleElimination',
      roundCount: 2,
    });

    expect(req.request.body).toEqual({ format: 'SingleElimination', publicDecklists: false });
  });

  it('asks the organizer to pick the winner of each unreported match before completing the round', async () => {
    const { fixture } = await openCompleteRound(singleEliminationPlaying());
    const dialog = openDialog()!;

    expect(text(dialog)).toContain('Tournament round 2 is paired, and its matches open.');
    expect(text(dialog)).toContain('Pick the winner of each unreported match: they advance.');
    expect(button(dialog, 'Complete round')!.disabled).toBe(true);
    const winner = group(dialog, 'Winner of Bob vs Carol')!;
    controlByLabel(winner, 'radio', 'Carol')!.click();
    await fixture.whenStable();
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      final,
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ grantedWins: [{ matchId: 'm1', winner: carol.id }] });
    await vi.waitFor(() => expect(openDialog()).toBeNull());
  });

  it('completes the tournament with the final, awarding the trophy', async () => {
    const { fixture, page } = await openCompleteRound(final);
    const dialog = openDialog()!;

    expect(text(dialog)).toContain(
      'It is the final tournament round, so the tournament completes and the trophy is awarded.',
    );
    controlByLabel(group(dialog, 'Winner of Alice vs Carol')!, 'radio', 'Alice')!.click();
    await fixture.whenStable();
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      { ...final, state: 'Complete', lastCompletedRound: 2, trophyHolders: [alice.id] },
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ grantedWins: [{ matchId: 'm2', winner: alice.id }] });
    expect(items(panel(page), 'Trophy holders')).toEqual(['Alice']);
  });
});

describe('dropping players from the single elimination Complete round dialog', () => {
  it('drops a player from an unreported match instead of picking its winner', async () => {
    const { fixture } = await openCompleteRound(singleEliminationPlaying());
    const dialog = openDialog()!;

    controlByLabel(group(dialog, 'Drop from Bob vs Carol')!, 'checkbox', 'Drop Bob')!.click();
    await fixture.whenStable();

    expect(text(dialog)).toContain('drop a player who won’t play on');
    expect(
      controlByLabel(group(dialog, 'Winner of Bob vs Carol')!, 'radio', 'Carol')!.disabled,
    ).toBe(true);
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      final,
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ drops: [{ matchId: 'm1', drop: [bob.id] }] });
  });

  it('says the tournament completes when dropping both players leaves one player in the bracket', async () => {
    const { fixture } = await openCompleteRound(singleEliminationPlaying());
    const dialog = openDialog()!;
    const drops = group(dialog, 'Drop from Bob vs Carol')!;

    controlByLabel(drops, 'checkbox', 'Drop Bob')!.click();
    controlByLabel(drops, 'checkbox', 'Drop Carol')!.click();
    await fixture.whenStable();

    expect(text(dialog)).toContain(
      'Fewer than 2 players are left in the bracket, so the tournament completes and the trophy is awarded.',
    );
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      { ...final, state: 'Complete', trophyHolders: [alice.id] },
      1,
      threePlayers,
    );
    expect(req.request.body).toEqual({ drops: [{ matchId: 'm1', drop: [bob.id, carol.id] }] });
  });
});

describe('both finalists dropping', () => {
  it('says nobody holds the trophy, from the dialog to the completed tournament', async () => {
    const { fixture, page } = await openCompleteRound(final);
    const dialog = openDialog()!;
    const drops = group(dialog, 'Drop from Alice vs Carol')!;

    controlByLabel(drops, 'checkbox', 'Drop Alice')!.click();
    controlByLabel(drops, 'checkbox', 'Drop Carol')!.click();
    await fixture.whenStable();

    expect(text(dialog)).toContain(
      'It is the final tournament round, so the tournament completes. Nobody advances from the final, so nobody holds the trophy.',
    );
    expect(text(dialog)).not.toContain('the trophy is awarded');
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      { ...final, state: 'Complete', lastCompletedRound: 2, trophyHolders: [] },
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ drops: [{ matchId: 'm2', drop: [alice.id, carol.id] }] });
    expect(text(panel(page))).toContain('Nobody holds the trophy');
  });

  it('still awards the trophy when one finalist drops', async () => {
    const { fixture } = await openCompleteRound(final);
    const dialog = openDialog()!;

    controlByLabel(group(dialog, 'Drop from Alice vs Carol')!, 'checkbox', 'Drop Alice')!.click();
    await fixture.whenStable();

    expect(text(dialog)).toContain('the trophy is awarded');
  });
});

describe('the single elimination correction warning', () => {
  const PREVIEW = '/api/drafts/draft-1/tournament/matches/m1/game-score/preview';
  const GAME_SCORE = '/api/drafts/draft-1/tournament/matches/m1/game-score';
  /** The final cleared, as correcting round 1 to Bob's win would. */
  const finalCleared: CorrectionPreview = {
    clears: [{ round: 2, bracketPlace: 0, players: [alice.id, carol.id] }],
    state: 'Playing',
  };

  /** Opens the game score choice of Bob vs Carol, of completed round 1, for an organizer, on `tournament`. */
  async function openCorrecting(tournament: ViewerTournamentView = final) {
    const opened = await openPlaying(tournament, { powers: ORGANIZE_ONLY });
    button(opened.tab, 'Correct Bob vs Carol')!.click();
    await opened.fixture.whenStable();
    return { ...opened, choice: group(opened.tab, 'Game score of Bob vs Carol')! };
  }

  /** Answers the pending preview with `preview`, expecting it to preview `games`. */
  async function answerPreview(
    fixture: AppFixture,
    games: CorrectionPreviewRequest['games'],
    preview: CorrectionPreview,
  ) {
    const req = await vi.waitFor(() => http.expectOne(PREVIEW));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ games });
    req.flush(preview);
    await fixture.whenStable();
  }

  it('lists the later matches a correction that changes the winner clears, then corrects it', async () => {
    const { fixture, choice } = await openCorrecting();

    button(choice, 'Bob won 2–0')!.click();
    await answerPreview(fixture, [2, 0], finalCleared);
    const dialog = await vi.waitFor(() => openDialog()!);

    expect(text(dialog)).toContain('Correct Bob vs Carol?');
    expect(items(dialog, 'Matches to clear')).toEqual(['Tournament round 2: Alice vs Carol']);
    button(dialog, 'Correct')!.click();
    const req = await answerChange(fixture, GAME_SCORE, 'PUT', final, 1, threePlayers);

    expect(req.request.body).toEqual({ games: [2, 0] });
    await vi.waitFor(() => expect(openDialog()).toBeNull());
  });

  it('sends nothing when the organizer cancels the warning', async () => {
    const { fixture, choice } = await openCorrecting();

    button(choice, 'Bob won 2–0')!.click();
    await answerPreview(fixture, [2, 0], finalCleared);
    button(await vi.waitFor(() => openDialog()!), 'Cancel')!.click();
    await fixture.whenStable();

    http.expectNone(GAME_SCORE);
    await vi.waitFor(() => expect(openDialog()).toBeNull());
  });

  it('corrects at once when the correction clears nothing', async () => {
    const { fixture, choice } = await openCorrecting();

    button(choice, 'Carol won 2–0')!.click();
    await answerPreview(fixture, [0, 2], { clears: [], state: 'Playing' });
    const req = await answerChange(fixture, GAME_SCORE, 'PUT', final, 1, threePlayers);

    expect(req.request.body).toEqual({ games: [0, 2] });
    expect(openDialog()).toBeNull();
  });

  it('offers Clear for a match of a completed round, warning of the later matches it clears', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { fixture, choice } = await openCorrecting();

    button(choice, 'Clear game score')!.click();
    await answerPreview(fixture, null, finalCleared);
    const dialog = await vi.waitFor(() => openDialog()!);

    expect(text(dialog)).toContain('Clear the game score of Bob vs Carol?');
    expect(text(dialog)).toContain('The match is unreported again.');
    expect(items(dialog, 'Matches to clear')).toEqual(['Tournament round 2: Alice vs Carol']);
    button(dialog, 'Clear')!.click();
    await answerChange(fixture, GAME_SCORE, 'DELETE', final, 1, threePlayers);

    expect(confirm).not.toHaveBeenCalled();
  });

  it('warns that a correction has a complete tournament played on, taking the trophy back', async () => {
    const complete: ViewerTournamentView = {
      ...final,
      state: 'Complete',
      trophyHolders: [carol.id],
    };
    const { fixture, choice } = await openCorrecting(complete);

    button(choice, 'Bob won 2–0')!.click();
    await answerPreview(fixture, [2, 0], finalCleared);
    const dialog = await vi.waitFor(() => openDialog()!);

    expect(text(dialog)).toContain(
      'The tournament plays on, and the trophy is taken back until the final is played again.',
    );
  });

  it('warns that a change completes the tournament, even when it clears nothing', async () => {
    const { fixture, choice } = await openCorrecting();

    button(choice, 'Bob won 2–0')!.click();
    await answerPreview(fixture, [2, 0], { clears: [], state: 'Complete' });
    const dialog = await vi.waitFor(() => openDialog()!);

    expect(text(dialog)).toContain(
      'Fewer than 2 players are left in the bracket, so the tournament completes and the trophy is awarded.',
    );
    expect(text(dialog)).not.toContain('later matches are cleared');
  });
});
