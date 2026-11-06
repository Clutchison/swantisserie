import type { ViewerTournamentView } from 'contract';
import { openDialog } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  alertIn,
  alice,
  bob,
  button,
  controlByLabel,
  controlsByLabel,
  draft,
  flushPicks,
  group,
  http,
  items,
  link,
  namedList,
  panel,
  region,
  text,
  useDraftsApp,
} from './harness';
import {
  announcements,
  answerChange,
  carol,
  dave,
  openComplete,
  openMatch,
  openPlaying,
  openPlayTab,
  progressLine,
  pushTournament,
  registration,
  reported,
  roundLabels,
  standing,
  standingsAsOf,
  standingsColumns,
  standingsRows,
  swissPlaying,
  swissRoundsWith,
  threePlayers,
  withTournament,
} from './play-tab-harness';

useDraftsApp();

/** A Swiss tournament in registration, joined by Alice, Bob and Carol, capped at 3 tournament rounds. */
const swissRegistration = {
  ...registration(alice.id, bob.id, carol.id),
  format: 'Swiss',
  swissRoundOption: 'CappedAt3',
  roundCount: 2,
} as const;

describe('Swiss tournaments on the Play tab', () => {
  it('offers Swiss at setup with its round option, until there’s a winner unless capped at 3', async () => {
    const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });
    const tab = await openPlayTab(fixture, page);

    expect(group(tab, 'Swiss round option')).toBeNull();
    controlByLabel(tab, 'radio', 'Swiss')!.click();
    await fixture.whenStable();
    const rounds = group(tab, 'Swiss round option')!;
    expect(controlByLabel(rounds, 'radio', 'Until there’s a winner')?.checked).toBe(true);
    controlByLabel(rounds, 'radio', 'Capped at 3 tournament rounds')!.click();
    button(tab, 'Set up tournament')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament',
      'POST',
      swissRegistration,
    );

    expect(req.request.body).toEqual({
      format: 'Swiss',
      swissRoundOption: 'CappedAt3',
      publicDecklists: false,
    });
  });

  it('shows how many tournament rounds it will have', async () => {
    const { tab } = await openPlaying(swissRegistration, { user: dave });

    expect(text(tab)).toContain('Swiss, capped at 3: 2 tournament rounds');
  });

  it.each([
    [
      'tournament round 1, before any is completed',
      { lastCompletedRound: 0, roundCount: 3 },
      'Tournament round 1 of 3',
    ],
    ['the round after the last completed one', {}, 'Tournament round 2 of 2'],
  ])('says while it is playing that it is on %s', async (_, fields, line) => {
    const { tab } = await openPlaying(swissPlaying(fields), { user: dave });

    expect(progressLine(tab)).toBe(line);
  });

  it('announces each new tournament round', async () => {
    const { fixture, tab } = await openPlaying(swissPlaying({ lastCompletedRound: 0 }), {
      user: dave,
    });
    expect(announcements(tab)).toEqual([]);

    await pushTournament(fixture, swissPlaying(), 1);

    expect(announcements(tab)).toEqual(['Tournament round 2 of 2']);
  });

  it.each([
    ['during registration', swissRegistration],
    ['once it is complete', swissPlaying({ state: 'Complete' })],
  ])('says no tournament round %s', async (_, tournament) => {
    const { tab } = await openPlaying(tournament, { user: dave });

    expect(progressLine(tab)).toBe('');
    expect(text(tab)).not.toContain('Tournament round 2 of 2');
  });

  it('lists the matches by tournament round, the current round first', async () => {
    const { tab } = await openPlaying(swissPlaying(), { user: dave });

    expect(text(tab)).toContain('Swiss, until there’s a winner: 2 tournament rounds');
    expect(roundLabels(tab)).toEqual(['Tournament round 2', 'Tournament round 1']);
    expect(items(tab, 'Tournament round 2')).toEqual([
      'Alice vs Carol · Unreported',
      'Bob has a bye',
    ]);
    expect(items(tab, 'Tournament round 1')).toEqual(['Carol 2–0 Bob', 'Alice has a bye']);
  });

  /** Tournament round 1 of three players, Carol and Bob's match unreported and Alice with the bye. */
  const unreportedRoundOne = swissPlaying({
    lastCompletedRound: 0,
    rounds: [{ round: 1, matches: [openMatch('m1', carol.id, bob.id)], byes: [alice.id] }],
  });

  /** Opens the Complete round dialog for an organizer, on `tournament`. */
  async function openCompleteRound(tournament: ViewerTournamentView) {
    const opened = await openPlaying(tournament, { powers: ORGANIZE_ONLY });
    button(opened.tab, 'Complete round')!.click();
    await opened.fixture.whenStable();
    return opened;
  }

  it('asks which players of each unreported match to drop as it becomes a granted draw', async () => {
    const { fixture } = await openCompleteRound(unreportedRoundOne);
    const dialog = openDialog()!;

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(text(dialog)).toContain(
      'Completing the round will pair tournament round 2 and open its matches.',
    );
    expect(text(dialog)).toContain('Its unreported matches will become granted draws.');
    const choices = group(dialog, 'Drop from Carol vs Bob')!;
    expect(controlByLabel(choices, 'checkbox', 'Drop Carol')!.checked).toBe(false);
    controlByLabel(choices, 'checkbox', 'Drop Bob')!.click();
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      swissPlaying(),
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ grantedDraws: [{ matchId: 'm1', drop: [bob.id] }] });
    await vi.waitFor(() => expect(openDialog()).toBeNull());
  });

  it('asks no drop question in the final tournament round, which completes the tournament', async () => {
    const { fixture, page } = await openCompleteRound(swissPlaying());
    const dialog = openDialog()!;

    expect(text(dialog)).toContain(
      'It is the final tournament round, so completing it will complete the tournament and award the trophy.',
    );
    expect(text(dialog)).toContain('Alice vs Carol');
    expect(group(dialog, 'Drop from Alice vs Carol')).toBeNull();
    expect(controlsByLabel(dialog, 'checkbox', 'Drop Alice')).toEqual([]);
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      swissPlaying({ state: 'Complete', lastCompletedRound: 2, trophyHolders: [alice.id] }),
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ grantedDraws: [{ matchId: 'm2', drop: [] }] });
    expect(items(panel(page), 'Trophy holders')).toEqual(['Alice']);
    expect(button(panel(page), 'Complete round')).toBeUndefined();
  });

  it('says the tournament completes once fewer than 2 undropped players would remain, counting the drops chosen', async () => {
    // Bob dropped after his bye; Alice and Carol's match is unreported.
    await openCompleteRound(
      swissPlaying({
        lastCompletedRound: 0,
        entries: [
          { playerId: alice.id, dropped: false, seed: null },
          { playerId: bob.id, dropped: true, seed: null },
          { playerId: carol.id, dropped: false, seed: null },
        ],
        rounds: [{ round: 1, matches: [openMatch('m1', alice.id, carol.id)], byes: [bob.id] }],
      }),
    );
    const dialog = openDialog()!;
    const completes =
      'Fewer than 2 undropped players will remain, so completing the round will complete the tournament';
    expect(text(dialog)).toContain(
      'Completing the round will pair tournament round 2 and open its matches.',
    );
    expect(text(dialog)).not.toContain(completes);

    controlByLabel(group(dialog, 'Drop from Alice vs Carol')!, 'checkbox', 'Drop Carol')!.click();
    await vi.waitFor(() => expect(text(dialog)).toContain(completes));

    expect(text(dialog)).not.toContain('will pair tournament round 2');
  });

  it('completes a fully reported tournament round with no granted draws, in place of completing the tournament', async () => {
    const { fixture, tab } = await openCompleteRound(
      swissPlaying({
        lastCompletedRound: 0,
        rounds: [
          {
            round: 1,
            matches: [reported(openMatch('m1', carol.id, bob.id), [2, 0], carol.id)],
            byes: [alice.id],
          },
        ],
      }),
    );
    expect(button(tab, 'Complete tournament')).toBeUndefined();
    const dialog = openDialog()!;

    expect(text(dialog)).not.toContain('granted draws');
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      swissPlaying(),
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ grantedDraws: [] });
  });

  it('sends nothing when the organizer cancels', async () => {
    const { fixture } = await openCompleteRound(unreportedRoundOne);

    button(openDialog()!, 'Cancel')!.click();
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
    http.expectNone('/api/drafts/draft-1/tournament/complete-round');
  });

  it('shows why completing the tournament round was refused', async () => {
    const { fixture, page } = await openCompleteRound(unreportedRoundOne);

    button(openDialog()!, 'Complete round')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament/complete-round'))).flush(
      { error: 'not-playing', message: 'This tournament isn’t being played.' },
      { status: 409, statusText: 'Conflict' },
    );
    // A refusal catches up with the draft.
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft(withTournament(unreportedRoundOne, threePlayers)),
    );
    await flushPicks([]);
    await fixture.whenStable();

    await vi.waitFor(() =>
      expect(alertIn(panel(page))?.textContent).toContain('This tournament isn’t being played.'),
    );
    expect(openDialog()).toBeNull();
  });

  it('offers Complete round only to organizers', async () => {
    const { tab } = await openPlaying(swissPlaying());

    expect(button(tab, 'Complete round')).toBeUndefined();
  });

  it('says which tournament round the standings are as of', async () => {
    const { tab } = await openPlaying(swissPlaying({ lastCompletedRound: 1 }), { user: dave });

    expect(standingsAsOf(tab)).toBe('After tournament round 1');
  });

  it('says the standings wait for tournament round 1 until it is completed', async () => {
    const { tab } = await openPlaying(swissPlaying({ lastCompletedRound: 0 }), { user: dave });

    expect(standingsAsOf(tab)).toBe('No tournament rounds completed yet');
  });

  it('says nothing of which tournament round the standings are as of once the tournament is complete', async () => {
    const { tab } = await openPlaying(swissPlaying({ state: 'Complete', lastCompletedRound: 2 }), {
      user: dave,
    });

    expect(standingsAsOf(tab)).toBeNull();
  });

  it('shows the standings with the MTR’s tiebreak columns', async () => {
    const { tab } = await openPlaying(
      swissPlaying({
        standings: [
          standing(carol.id, 1, {
            matchPoints: 3,
            matches: { won: 1, lost: 0, drawn: 0 },
            games: { won: 2, lost: 0, drawn: 0 },
            gameWinPercent: 100,
            opponentsMatchWinPercent: 33,
            opponentsGameWinPercent: 33,
          }),
          standing(alice.id, 1, {
            matchPoints: 3,
            matches: { won: 1, lost: 0, drawn: 0 },
            games: { won: 2, lost: 0, drawn: 0 },
            gameWinPercent: 100,
            opponentsMatchWinPercent: 33,
            opponentsGameWinPercent: 33,
          }),
          standing(bob.id, 3, {
            matches: { won: 0, lost: 1, drawn: 0 },
            games: { won: 0, lost: 2, drawn: 0 },
            gameWinPercent: 33,
            opponentsMatchWinPercent: 100,
            opponentsGameWinPercent: 200 / 3,
          }),
        ],
      }),
      { user: dave },
    );

    expect(standingsColumns(tab)).toEqual([
      'Rank',
      'Player',
      'Match points',
      'Matches won, lost and drawn',
      'Opponents’ match-win %',
      'Game-win %',
      'Opponents’ game-win %',
    ]);
    expect(standingsRows(tab)).toEqual([
      ['1', 'Carol', '3', '1–0–0', '33%', '100%', '33%'],
      ['1', 'Alice', '3', '1–0–0', '33%', '100%', '33%'],
      ['3', 'Bob', '0', '0–1–0', '100%', '33%', '67%'],
    ]);
  });

  describe('your match', () => {
    const yourMatch = (tab: HTMLElement) => region(tab, 'Your match')!;
    /** Carol reporting that she beat Alice 2–1 in round 2's match. */
    const carolBeatAlice = reported(openMatch('m2', alice.id, carol.id), [1, 2], carol.id);

    it('offers Confirm, with who reported what and a link to your Deck tab, once your opponent reported it', async () => {
      const { fixture, tab } = await openPlaying(
        swissPlaying({ rounds: swissRoundsWith(carolBeatAlice) }),
      );

      expect(text(yourMatch(tab))).toContain('Tournament round 2: Carol reported you lost 1–2');
      expect(text(yourMatch(tab))).not.toContain('All your matches are reported.');
      expect(link(yourMatch(tab), 'Your deck')).toBeDefined();
      expect(
        button(namedList(tab, 'Tournament round 2'), 'Confirm your match against Carol'),
      ).toBeUndefined();

      button(yourMatch(tab), 'Confirm your match against Carol')!.click();
      const req = await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/matches/m2/confirm',
        'POST',
        swissPlaying({ rounds: swissRoundsWith({ ...carolBeatAlice, confirmed: true }) }),
        1,
        threePlayers,
      );

      expect(req.request.body).toBeNull();
      expect(text(yourMatch(tab))).toContain('All your matches are reported.');
    });

    it('says all your matches are reported only once nothing is left to report or confirm', async () => {
      const aliceBeatCarol = reported(openMatch('m2', alice.id, carol.id), [2, 1], alice.id);
      const { tab } = await openPlaying(swissPlaying({ rounds: swissRoundsWith(aliceBeatCarol) }));

      expect(text(yourMatch(tab))).toContain('All your matches are reported.');
      expect(button(yourMatch(tab), 'Confirm your match against Carol')).toBeUndefined();
    });

    it('shows the earlier tournament round’s match to confirm before a later one to report, unless you choose that one', async () => {
      const bobBeatAlice = reported(openMatch('m1', alice.id, bob.id), [1, 2], bob.id);
      const { fixture, tab } = await openPlaying(
        swissPlaying({
          rounds: [
            { round: 1, matches: [bobBeatAlice], byes: [carol.id] },
            { round: 2, matches: [openMatch('m2', alice.id, carol.id)], byes: [bob.id] },
          ],
        }),
      );

      expect(text(yourMatch(tab))).toContain('Tournament round 1: Bob reported you lost 1–2');
      expect(button(yourMatch(tab), 'Confirm your match against Bob')).toBeDefined();

      button(namedList(tab, 'Tournament round 2'), 'Report your match against Carol')!.click();
      await fixture.whenStable();

      expect(text(yourMatch(tab))).toContain('Tournament round 2: against Carol');
      expect(button(yourMatch(tab), 'Won 2–0')).toBeDefined();
      expect(
        button(namedList(tab, 'Tournament round 1'), 'Confirm your match against Bob'),
      ).toBeDefined();
    });
  });
});
