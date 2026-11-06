import { answer, openDialog, pressEscape, question, table } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  alertIn,
  alice,
  bob,
  button,
  draft,
  flushPicks,
  group,
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
  gridCell,
  gridCellName,
  gridColumns,
  gridRows,
  openMatch,
  openPlaying,
  playing,
  progressLine,
  pushTournament,
  registration,
  reported,
  resultsGrid,
  roundLabels,
  standing,
  swissPlaying,
  threePlayers,
  withDrops,
  withTournament,
  yourMatches,
} from './play-tab-harness';

useDraftsApp();

describe('Play tab while the tournament is played', () => {
  describe('your matches', () => {
    it('lists one line per opponent, unreported first, with a link to your Deck tab', async () => {
      const { fixture, page, tab } = await openPlaying(
        playing([reported(openMatch('m2', alice.id, bob.id), [2, 1], alice.id)]),
      );

      expect(yourMatches(tab)).toEqual(['vs Carol', 'vs Bob · Won 2–1']);
      // Confirm is for the opponent of a match that is reported, not its reporter.
      expect(button(tab, 'Confirm your match against Bob')).toBeUndefined();
      expect(button(tab, 'Confirm your match against Carol')).toBeUndefined();
      expect(text(tab)).not.toContain('Tournament round');
      expect(text(tab)).not.toContain('bye');

      link(region(tab, 'Your matches')!, 'Your deck')!.click();
      await fixture.whenStable();
      await vi.waitFor(() => expect(panelName(page)).toBe('Deck'));
    });

    it('shows a match your opponent reported with Confirm, and confirmed matches as confirmed', async () => {
      const { tab } = await openPlaying(
        playing([
          reported(openMatch('m2', alice.id, bob.id), [1, 2], bob.id),
          { ...reported(openMatch('m3', carol.id, alice.id), [2, 0], alice.id), confirmed: true },
        ]),
      );

      expect(yourMatches(tab)).toEqual([
        'Bob reported you lost 1–2',
        'vs Carol · Lost 0–2 · Confirmed',
      ]);
      expect(button(tab, 'Confirm your match against Bob')).toBeDefined();
      expect(button(tab, 'Confirm your match against Carol')).toBeUndefined();
    });

    it('shows a forfeit by an opponent who dropped', async () => {
      const { tab } = await openPlaying(
        withDrops([carol.id], [forfeited(openMatch('m3', carol.id, alice.id), carol.id)]),
      );

      expect(yourMatches(tab)).toEqual(['vs Bob', 'Forfeit: Carol dropped']);
      expect(button(tab, 'Report your match against Carol')).toBeUndefined();
    });

    it('reports any unreported match in any order, sending the game score in the match’s player order', async () => {
      const { fixture, tab } = await openPlaying(playing());

      button(tab, 'Report your match against Carol')!.click();
      await fixture.whenStable();
      const scores = group(tab, 'Game score against Carol')!;
      expect([...scores.querySelectorAll('button')].map((b) => text(b))).toEqual([
        'Won 2–0',
        'Won 2–1',
        'Lost 1–2',
        'Lost 0–2',
      ]);
      button(scores, 'Won 2–1')!.click();
      const dialog = await question('Report that you won 2–1 against Carol?');
      expect(dialog.textContent).toContain('Only an organizer can change a reported match.');
      await answer(dialog, 'Report');
      const req = await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/matches/m3/report',
        'POST',
        playing([reported(openMatch('m3', carol.id, alice.id), [1, 2], alice.id)]),
        1,
        threePlayers,
      );

      expect(req.request.body).toEqual({ games: [1, 2] });
      expect(yourMatches(tab)).toEqual(['vs Bob', 'vs Carol · Won 2–1']);
    });

    it('sends nothing when you think better of the report', async () => {
      const { fixture, tab } = await openPlaying(playing());
      button(tab, 'Report your match against Bob')!.click();
      await fixture.whenStable();
      const opener = button(group(tab, 'Game score against Bob')!, 'Won 2–0')!;
      opener.focus();
      opener.click();

      await answer(await question('Report that you won 2–0 against Bob?'), 'Cancel');
      await fixture.whenStable();

      expect(document.activeElement).toBe(opener);
      http.expectNone('/api/drafts/draft-1/tournament/matches/m2/report');
    });

    it('confirms an opponent’s report from its line', async () => {
      const bobBeatAlice = reported(openMatch('m2', alice.id, bob.id), [1, 2], bob.id);
      const { fixture, tab } = await openPlaying(playing([bobBeatAlice]));

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
      expect(yourMatches(tab)).toEqual(['vs Carol', 'vs Bob · Lost 1–2 · Confirmed']);
    });

    it('says why a report was refused', async () => {
      const { fixture, page, tab } = await openPlaying(playing());

      button(tab, 'Report your match against Bob')!.click();
      await fixture.whenStable();
      button(group(tab, 'Game score against Bob')!, 'Won 2–0')!.click();
      await answer(await question('Report that you won 2–0 against Bob?'), 'Report');
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

    it.each([
      ['a viewer who didn’t join', playing(), dave],
      ['a player who dropped', withDrops([alice.id]), alice],
    ])('is absent for %s', async (_, tournament, user) => {
      const { tab } = await openPlaying(tournament, { user });

      expect(region(tab, 'Your matches')).toBeNull();
      expect(region(tab, 'Your match')).toBeNull();
    });

    describe('confirming a match', () => {
      /** Bob reporting that he beat Alice 2–1 in match m2. */
      const bobBeatAlice = reported(openMatch('m2', alice.id, bob.id), [1, 2], bob.id);

      it('lets the opponent confirm once the tournament is complete', async () => {
        const completeWith = (m2: ReturnType<typeof openMatch>) =>
          playing([m2], { state: 'Complete', trophyHolders: [bob.id] });
        const { fixture, tab } = await openPlaying(completeWith(bobBeatAlice));

        button(tab, 'Confirm your match against Bob')!.click();
        await answerChange(
          fixture,
          '/api/drafts/draft-1/tournament/matches/m2/confirm',
          'POST',
          completeWith({ ...bobBeatAlice, confirmed: true }),
          1,
          threePlayers,
        );

        expect(yourMatches(tab)).toContain('vs Bob · Lost 1–2 · Confirmed');
        expect(text(gridCell(tab, 'Bob', 'Alice'))).toBe('2–1');
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
  });

  describe('results grid', () => {
    const carolLeads = playing(
      [
        reported(openMatch('m1', bob.id, carol.id), [1, 2], carol.id),
        { ...openMatch('m3', carol.id, alice.id), outcome: { kind: 'GrantedDraw' } },
      ],
      {
        standings: [
          standing(carol.id, 1, {
            matchPoints: 4,
            matches: { won: 1, lost: 0, drawn: 1 },
            games: { won: 2, lost: 1, drawn: 0 },
            gameWinPercent: 200 / 3,
          }),
          standing(alice.id, 2, { matchPoints: 1, matches: { won: 0, lost: 0, drawn: 1 } }),
          standing(bob.id, 3, {
            matches: { won: 0, lost: 1, drawn: 0 },
            games: { won: 1, lost: 2, drawn: 0 },
            gameWinPercent: 100 / 3,
          }),
        ],
      },
    );

    it('shows every player’s result against each opponent in standings order, in place of the standings and rounds', async () => {
      const { tab } = await openPlaying(carolLeads, { user: dave });

      expect(gridColumns(tab)).toEqual([
        'Rank',
        'Player',
        'Carol',
        'Alice',
        'Bob',
        'Match points',
        'Matches won, lost and drawn',
        'Game-win %',
      ]);
      expect(gridRows(tab)).toEqual([
        ['1', 'Carol', '—', 'D', '2–1?', '4', '1–0–1', '67%'],
        ['2', 'Alice', 'D', '—', '', '1', '0–0–1', '0%'],
        ['3', 'Bob', '1–2?', '', '—', '0', '0–1–0', '33%'],
      ]);
      expect(table(tab, 'Standings')).toBeNull();
      expect(roundLabels(tab)).toEqual([]);
      expect(text(tab)).not.toContain('Tournament round');
    });

    it('names each cell’s result in words, from its row’s side', async () => {
      const { tab } = await openPlaying(carolLeads, { user: dave });

      expect(gridCellName(tab, 'Carol', 'Bob')).toBe(
        'Carol against Bob: Carol won 2–1, unconfirmed',
      );
      expect(gridCellName(tab, 'Bob', 'Carol')).toBe(
        'Bob against Carol: Bob lost 1–2, unconfirmed',
      );
      expect(gridCellName(tab, 'Alice', 'Bob')).toBe('Alice against Bob: unreported');
      expect(gridCellName(tab, 'Carol', 'Alice')).toBe('Carol against Alice: granted draw');
    });

    it('drops the unconfirmed mark once the match is confirmed', async () => {
      const m1 = {
        ...reported(openMatch('m1', bob.id, carol.id), [1, 2], carol.id),
        confirmed: true,
      };
      const { tab } = await openPlaying(playing([m1]), { user: dave });

      expect(text(gridCell(tab, 'Carol', 'Bob'))).toBe('2–1');
      expect(gridCellName(tab, 'Carol', 'Bob')).toBe('Carol against Bob: Carol won 2–1');
    });

    it('marks a dropped player’s forfeits F on their side and W on their opponent’s', async () => {
      const { tab } = await openPlaying(
        withDrops([carol.id], [forfeited(openMatch('m3', carol.id, alice.id), carol.id)]),
        { user: dave },
      );

      expect(text(gridCell(tab, 'Carol', 'Alice'))).toBe('F');
      expect(text(gridCell(tab, 'Alice', 'Carol'))).toBe('W');
      expect(gridCellName(tab, 'Carol', 'Alice')).toBe('Carol against Alice: Carol forfeited');
      expect(gridCellName(tab, 'Alice', 'Carol')).toBe(
        'Alice against Carol: Alice won, Carol forfeited',
      );
      expect(gridRows(tab).map((row) => row[1])).toEqual(['Alice', 'Bob', 'Carol (dropped)']);
    });

    it('scrolls sideways in its own region, which a keyboard can reach', async () => {
      const { tab } = await openPlaying(playing(), { user: dave });

      const scroller = region(tab, 'Results grid')!;
      expect(scroller.contains(resultsGrid(tab))).toBe(true);
      expect(scroller.tabIndex).toBe(0);
    });
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
    it('lets an organizer start the tournament once they go ahead', async () => {
      const { fixture, page, tab } = await openPlaying(registration(alice.id, bob.id, carol.id), {
        powers: ORGANIZE_ONLY,
      });

      button(tab, 'Start tournament')!.click();
      const dialog = await question('Start the tournament?');
      expect(dialog.textContent).toContain('Joining closes, and every match opens.');
      await answer(dialog, 'Start');
      await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/start',
        'POST',
        playing(),
        1,
        threePlayers,
      );

      expect(currentSteps(panel(page))).toEqual(['Playing']);
      expect(yourMatches(panel(page))).toEqual(['vs Bob', 'vs Carol']);
      expect(button(panel(page), 'Start tournament')).toBeUndefined();
    });

    it('starts nothing when the organizer presses Escape at the question', async () => {
      const { fixture, tab } = await openPlaying(registration(alice.id, bob.id, carol.id), {
        powers: ORGANIZE_ONLY,
      });
      const opener = button(tab, 'Start tournament')!;
      opener.focus();
      opener.click();

      await question('Start the tournament?');
      pressEscape();
      await vi.waitFor(() => expect(openDialog()).toBeNull());
      await fixture.whenStable();

      http.expectNone('/api/drafts/draft-1/tournament/start');
      expect(document.activeElement).toBe(opener);
    });

    it('offers Start only once two players have joined', async () => {
      const { tab } = await openPlaying(registration(alice.id), { powers: ORGANIZE_ONLY });

      expect(button(tab, 'Start tournament')?.disabled).toBe(true);
    });

    it('offers Start only to organizers', async () => {
      const { tab } = await openPlaying(registration(alice.id, bob.id));

      expect(button(tab, 'Start tournament')).toBeUndefined();
    });

    it('lets an organizer complete the tournament once they go ahead, showing the trophy holder', async () => {
      const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

      button(tab, 'Complete tournament')!.click();
      const dialog = await question('Complete the tournament?');
      expect(dialog.textContent).toContain(
        'Its unreported matches become granted draws, and the trophy is awarded.',
      );
      await answer(dialog, 'Complete tournament');
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
      expect(button(panel(page), 'Report your match against Bob')).toBeUndefined();
    });

    it('keeps the tournament playing when the organizer thinks better of completing it', async () => {
      const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

      button(tab, 'Complete tournament')!.click();
      await answer(await question('Complete the tournament?'), 'Cancel');
      await fixture.whenStable();

      http.expectNone('/api/drafts/draft-1/tournament/complete');
      expect(button(tab, 'Complete tournament')).toBeDefined();
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
