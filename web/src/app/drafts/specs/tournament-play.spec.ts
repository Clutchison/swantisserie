import {
  ORGANIZE_ONLY,
  alertIn,
  alice,
  bob,
  button,
  draft,
  flushPicks,
  http,
  items,
  link,
  panel,
  panelName,
  region,
  text,
  useDraftsApp,
} from './harness';
import {
  announcements,
  answerChange,
  carol,
  currentSteps,
  dave,
  forfeited,
  openMatch,
  openPlaying,
  playing,
  progressLine,
  pushTournament,
  registration,
  reported,
  standing,
  standingsAsOf,
  standingsColumns,
  standingsRows,
  threePlayers,
  withDrops,
  withTournament,
} from './play-tab-harness';

useDraftsApp();

describe('Play tab while the tournament is played', () => {
  describe('your match', () => {
    it('shows your first unreported match at the top, with your opponent and a link to your Deck tab', async () => {
      const { fixture, page, tab } = await openPlaying(playing());

      const yours = region(tab, 'Your match')!;
      expect(text(yours)).toContain('Tournament round 2');
      expect(text(yours)).toContain('against Bob');

      link(yours, 'Your deck')!.click();
      await fixture.whenStable();
      await vi.waitFor(() => expect(panelName(page)).toBe('Deck'));
    });

    it('reports a match you won, once you confirm, then moves on to your next match', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { fixture, page, tab } = await openPlaying(playing());

      button(region(tab, 'Your match')!, 'Won 2–1')!.click();
      expect(confirm).toHaveBeenCalledWith(
        'Report that you won 2–1 against Bob? Only an organizer can change a reported match.',
      );
      const after = playing([reported(openMatch('m2', alice.id, bob.id), [2, 1], alice.id)]);
      const req = await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/matches/m2/report',
        'POST',
        after,
        1,
        threePlayers,
      );

      expect(req.request.body).toEqual({ games: [2, 1] });
      expect(text(region(panel(page), 'Your match'))).toContain('against Carol');
    });

    it('sends a loss in the match’s player order when you are its second player', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const m2 = reported(openMatch('m2', alice.id, bob.id), [2, 0]);
      const { fixture, tab } = await openPlaying(playing([m2]));
      expect(text(region(tab, 'Your match'))).toContain('against Carol');

      button(region(tab, 'Your match')!, 'Lost 1–2')!.click();
      const req = await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/matches/m3/report',
        'POST',
        playing([m2, reported(openMatch('m3', carol.id, alice.id), [2, 1], alice.id)]),
        1,
        threePlayers,
      );

      expect(req.request.body).toEqual({ games: [2, 1] });
    });

    it('sends nothing when you don’t confirm the report', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { fixture, tab } = await openPlaying(playing());

      button(region(tab, 'Your match')!, 'Won 2–0')!.click();
      await fixture.whenStable();

      http.expectNone('/api/drafts/draft-1/tournament/matches/m2/report');
    });

    it('lets you report any of your open matches, chosen from the tournament rounds', async () => {
      const { fixture, tab } = await openPlaying(playing());

      button(tab, 'Report your match against Carol')!.click();
      await fixture.whenStable();

      expect(text(region(tab, 'Your match'))).toContain('Tournament round 3');
      expect(text(region(tab, 'Your match'))).toContain('against Carol');
    });

    it('says why a report was refused', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { fixture, page, tab } = await openPlaying(playing());

      button(region(tab, 'Your match')!, 'Won 2–0')!.click();
      (
        await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament/matches/m2/report'))
      ).flush(
        { error: 'match-reported', message: 'This match has been reported.' },
        { status: 409, statusText: 'Conflict' },
      );
      // A refusal catches up with the draft.
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(withTournament(playing(), threePlayers)),
      );
      await flushPicks([]);
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(alertIn(panel(page))?.textContent).toContain('This match has been reported.'),
      );
    });

    it('says when all your matches are reported', async () => {
      const { tab } = await openPlaying(
        playing([
          reported(openMatch('m2', alice.id, bob.id), [2, 0]),
          reported(openMatch('m3', carol.id, alice.id), [2, 1], carol.id),
        ]),
      );

      expect(text(region(tab, 'Your match'))).toContain('All your matches are reported.');
      expect(button(tab, 'Won 2–0')).toBeUndefined();
    });

    it('is absent for a viewer who didn’t join', async () => {
      const { tab } = await openPlaying(playing(), { user: dave });

      expect(region(tab, 'Your match')).toBeNull();
      expect(button(tab, 'Won 2–0')).toBeUndefined();
    });
  });

  it('shows the standings, best first, with shared ranks', async () => {
    const { tab } = await openPlaying(
      playing([], {
        standings: [
          standing(carol.id, 1, {
            matchPoints: 3,
            matches: { won: 1, lost: 0, drawn: 0 },
            games: { won: 2, lost: 1, drawn: 0 },
            gameWinPercent: 200 / 3,
          }),
          standing(alice.id, 2),
          standing(bob.id, 2, {
            matches: { won: 0, lost: 1, drawn: 0 },
            games: { won: 1, lost: 2, drawn: 0 },
            gameWinPercent: 100 / 3,
          }),
        ],
      }),
    );

    expect(standingsRows(tab)).toEqual([
      ['1', 'Carol', '3', '1–0–0', '67%'],
      ['2', 'Alice', '0', '0–0–0', '0%'],
      ['2', 'Bob', '0', '0–1–0', '33%'],
    ]);
  });

  it('says nothing of which tournament round round robin’s standings are as of, as they count every result', async () => {
    const { tab } = await openPlaying(playing([], { lastCompletedRound: 0 }), { user: dave });

    expect(standingsAsOf(tab)).toBeNull();
  });

  it('keeps round robin’s standings to game-win % alone', async () => {
    const { tab } = await openPlaying(playing(), { user: dave });

    expect(standingsColumns(tab)).toEqual([
      'Rank',
      'Player',
      'Match points',
      'Matches won, lost and drawn',
      'Game-win %',
    ]);
  });

  it('lists the matches by tournament round, with their outcomes and byes', async () => {
    const { tab } = await openPlaying(
      playing([
        reported(openMatch('m1', bob.id, carol.id), [1, 2], carol.id),
        { ...openMatch('m3', carol.id, alice.id), outcome: { kind: 'GrantedDraw' } },
      ]),
      { user: dave },
    );

    expect(items(tab, 'Tournament round 1')).toEqual(['Bob 1–2 Carol', 'Alice has a bye']);
    expect(items(tab, 'Tournament round 2')).toEqual([
      'Alice vs Bob · Unreported',
      'Carol has a bye',
    ]);
    expect(items(tab, 'Tournament round 3')).toEqual([
      'Carol vs Alice · Granted draw',
      'Bob has a bye',
    ]);
  });

  describe('matches left', () => {
    const m1 = openMatch('m1', bob.id, carol.id);
    const m2 = openMatch('m2', alice.id, bob.id);
    const m3 = openMatch('m3', carol.id, alice.id);

    it('tells a player who plays on how many of their matches are left', async () => {
      const { tab } = await openPlaying(playing());

      expect(progressLine(tab)).toBe('You have 2 matches left');
    });

    it('counts a reported match as done, confirmed or not, saying 1 match in the singular', async () => {
      const { tab } = await openPlaying(playing([reported(m2, [2, 1])]));

      expect(progressLine(tab)).toBe('You have 1 match left');
    });

    it('counts the tournament’s matches left once the player has none, a forfeit counting as done', async () => {
      const { tab } = await openPlaying(playing([reported(m2, [2, 1]), forfeited(m3, carol.id)]));

      expect(progressLine(tab)).toBe('1 match left in the tournament');
    });

    it('counts the tournament’s matches left for a viewer who didn’t join', async () => {
      const { tab } = await openPlaying(playing(), { user: dave, powers: ORGANIZE_ONLY });

      expect(progressLine(tab)).toBe('3 matches left in the tournament');
    });

    it('counts the tournament’s matches left for a player who dropped', async () => {
      const { tab } = await openPlaying(withDrops([alice.id], [m3]));

      expect(progressLine(tab)).toBe('3 matches left in the tournament');
    });

    it('says when every match is reported', async () => {
      const { tab } = await openPlaying(
        playing([reported(m1, [2, 0]), reported(m2, [2, 1]), forfeited(m3, carol.id)]),
        { powers: ORGANIZE_ONLY },
      );

      expect(progressLine(tab)).toBe('All matches reported');
    });

    it('announces the tournament starting and completing, but not its matches left changing', async () => {
      const { fixture, tab } = await openPlaying(registration(alice.id, bob.id, carol.id), {
        user: dave,
      });
      expect(announcements(tab)).toEqual([]);

      await pushTournament(fixture, playing(), 1);
      expect(announcements(tab)).toEqual(['Tournament: Playing']);

      await pushTournament(fixture, playing([reported(m1, [2, 0])]), 2);
      expect(progressLine(tab)).toBe('2 matches left in the tournament');
      expect(announcements(tab)).toEqual(['Tournament: Playing']);

      await pushTournament(fixture, playing([], { state: 'Complete' }), 3);
      expect(announcements(tab)).toEqual(['Tournament: Complete']);
    });

    it.each([
      ['during registration', registration(alice.id, bob.id, carol.id)],
      ['once the tournament is complete', playing([], { state: 'Complete' })],
    ])('says nothing of matches left %s', async (_, tournament) => {
      const { tab } = await openPlaying(tournament);

      expect(progressLine(tab)).toBe('');
    });
  });

  describe('organizer controls', () => {
    it('lets an organizer start the tournament once they confirm', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { fixture, page, tab } = await openPlaying(registration(alice.id, bob.id, carol.id), {
        powers: ORGANIZE_ONLY,
      });

      button(tab, 'Start tournament')!.click();
      expect(confirm).toHaveBeenCalledWith(
        'Start the tournament? Joining closes, and every match opens.',
      );
      await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/start',
        'POST',
        playing(),
        1,
        threePlayers,
      );

      expect(currentSteps(panel(page))).toEqual(['Playing']);
      expect(text(region(panel(page), 'Your match'))).toContain('against Bob');
      expect(button(panel(page), 'Start tournament')).toBeUndefined();
    });

    it('offers Start only once two players have joined', async () => {
      const { tab } = await openPlaying(registration(alice.id), { powers: ORGANIZE_ONLY });

      expect(button(tab, 'Start tournament')?.disabled).toBe(true);
    });

    it('offers Start only to organizers', async () => {
      const { tab } = await openPlaying(registration(alice.id, bob.id));

      expect(button(tab, 'Start tournament')).toBeUndefined();
    });

    it('lets an organizer complete the tournament once they confirm, showing the trophy holder', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

      button(tab, 'Complete tournament')!.click();
      expect(confirm).toHaveBeenCalledWith(
        'Complete the tournament? Its unreported matches become granted draws, and the trophy is awarded.',
      );
      await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/complete',
        'POST',
        playing([], { state: 'Complete', trophyHolders: [carol.id] }),
        1,
        threePlayers,
      );

      expect(currentSteps(panel(page))).toEqual(['Complete']);
      expect(items(panel(page), 'Trophy holders')).toEqual(['Carol']);
      expect(button(panel(page), 'Complete tournament')).toBeUndefined();
      expect(region(panel(page), 'Your match')).toBeNull();
    });

    it('shows every player who shares first as a trophy holder', async () => {
      const { tab } = await openPlaying(
        playing([], { state: 'Complete', trophyHolders: [alice.id, bob.id] }),
        { user: dave },
      );

      expect(items(tab, 'Trophy holders')).toEqual(['Alice', 'Bob']);
    });

    it('offers Complete tournament only to organizers', async () => {
      const { tab } = await openPlaying(playing());

      expect(button(tab, 'Complete tournament')).toBeUndefined();
    });
  });
});
