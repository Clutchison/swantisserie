import { answer, openDialog, pressEscape, question, table } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  accessibleDescription,
  accessibleName,
  alertIn,
  alice,
  bob,
  button,
  draft,
  flushPicks,
  http,
  items,
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
  currentSteps,
  dave,
  failChange,
  forfeited,
  grantedDraw,
  gridCell,
  gridCellName,
  gridColumnAvatar,
  gridColumns,
  gridHeaderReading,
  gridRows,
  unreportedMatch,
  openPlaying,
  playing,
  progressLine,
  pushTournament,
  registration,
  reported,
  resultsGrid,
  roundLabels,
  standing,
  standingsTable,
  swissPlaying,
  threePlayers,
  withDrops,
  withTournament,
  yourMatches,
  completed,
  confirmedMatch,
  COMPLETE_ROUND_URL,
  openCompleteRound,
} from './play-tab-harness';
import { singleEliminationPlaying } from './play-tab-single-elimination-harness';
import {
  actionButtons,
  expectByRegistration,
  expectBeforeLists,
  expectByActionRows,
  expectByActions,
  listsAfterActions,
} from './play-tab-placement-harness';

useDraftsApp();

describe('Play tab while the tournament is played', () => {
  describe('results grid', () => {
    const carolLeads = playing(
      [
        reported(unreportedMatch('m1', bob.id, carol.id), [1, 2], carol.id),
        grantedDraw(unreportedMatch('m3', carol.id, alice.id)),
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
      expect(standingsTable(tab)).toBeNull();
      expect(roundLabels(tab)).toEqual([]);
      expect(text(tab)).not.toContain('Tournament round');
    });

    it('heads each opponent’s column with their avatar, named and titled by their full name', async () => {
      const { tab } = await openPlaying(carolLeads, { user: dave });

      expect(gridColumnAvatar(tab, 'Carol')?.getAttribute('src')).toBe(carol.avatarUrl);
      expect(gridColumnAvatar(tab, 'Alice')?.getAttribute('src')).toBe(alice.avatarUrl);
      expect(gridColumnAvatar(tab, 'Bob')?.getAttribute('src')).toBe(bob.avatarUrl);
      expect(gridHeaderReading(tab, 'Carol')).toEqual({ shown: '', tooltip: 'Carol' });
    });

    it('shows an opponent’s rank in their column’s header once their avatar fails to load', async () => {
      const { fixture, tab } = await openPlaying(carolLeads, { user: dave });

      gridColumnAvatar(tab, 'Alice')!.dispatchEvent(new Event('error'));
      fixture.detectChanges();

      expect(gridColumnAvatar(tab, 'Alice')).toBeNull();
      expect(gridHeaderReading(tab, 'Alice')).toEqual({ shown: '2', tooltip: 'Alice' });
      expect(gridColumnAvatar(tab, 'Carol')).not.toBeNull();
    });

    it('abbreviates the stat headers, spelling each out on hover, as its name and in the key', async () => {
      const { tab } = await openPlaying(carolLeads, { user: dave });

      expect(gridHeaderReading(tab, 'Match points')).toEqual({
        shown: 'MP',
        tooltip: 'Match points',
      });
      expect(gridHeaderReading(tab, 'Matches won, lost and drawn')).toEqual({
        shown: 'W–L–D',
        tooltip: 'Matches won, lost and drawn',
      });
      expect(gridHeaderReading(tab, 'Game-win %')).toEqual({ shown: 'GW%', tooltip: 'Game-win %' });
      expect(accessibleDescription(resultsGrid(tab)!)).toContain(
        'MP match points, W–L–D matches won, lost and drawn, GW% game-win %',
      );
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
      const m1 = confirmedMatch(
        reported(unreportedMatch('m1', bob.id, carol.id), [1, 2], carol.id),
      );
      const { tab } = await openPlaying(playing([m1]), { user: dave });

      expect(text(gridCell(tab, 'Carol', 'Bob'))).toBe('2–1');
      expect(gridCellName(tab, 'Carol', 'Bob')).toBe('Carol against Bob: Carol won 2–1');
    });

    it('marks a dropped player’s forfeits F on their side and W on their opponent’s', async () => {
      const { tab } = await openPlaying(
        withDrops([carol.id], [forfeited(unreportedMatch('m3', carol.id, alice.id), carol.id)]),
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

    it('scrolls sideways in its own region, which a keyboard can reach and which alone names it', async () => {
      const { tab } = await openPlaying(playing(), { user: dave });

      const scroller = region(tab, 'Results grid')!;
      expect(scroller.contains(resultsGrid(tab))).toBe(true);
      expect(scroller.tabIndex).toBe(0);
      expect(table(tab, 'Results grid')).toBeNull();
    });
  });

  describe('matches left', () => {
    const m1 = unreportedMatch('m1', bob.id, carol.id);
    const m2 = unreportedMatch('m2', alice.id, bob.id);
    const m3 = unreportedMatch('m3', carol.id, alice.id);

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

      await pushTournament(fixture, completed(playing()), 3);
      expect(announcements(tab)).toEqual(['Tournament: Complete']);
    });

    it.each([
      ['during registration', registration(alice.id, bob.id, carol.id)],
      ['once the tournament is complete', completed(playing())],
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

    it('says why Start was refused, naming the players whose decks are short', async () => {
      const inRegistration = registration(alice.id, bob.id, carol.id);
      const { fixture, page, tab } = await openPlaying(inRegistration, { powers: ORGANIZE_ONLY });
      const reason =
        'A tournament deck needs at least 40 mainboard cards. These players’ hold fewer: Bob (39), Carol (1). They can fill their deck or leave, or an organizer can remove them.';

      button(tab, 'Start tournament')!.click();
      await answer(await question('Start the tournament?'), 'Start');
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament/start'))).flush(
        { error: 'deck-too-small', message: reason },
        { status: 409, statusText: 'Conflict' },
      );
      // A refusal catches up with the draft.
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(withTournament(inRegistration, threePlayers)),
      );
      await flushPicks([]);
      await fixture.whenStable();

      await vi.waitFor(() => expect(alertIn(panel(page))?.textContent).toContain(reason));
      expect(currentSteps(panel(page))).toEqual(['Registration']);
      expect(button(panel(page), 'Start tournament')).toBeDefined();
      expectByRegistration(page, panel(page));
    });

    it.each([
      ['disables', [alice.id], true],
      ['enables', [alice.id, bob.id], false],
    ])('%s Start with %j joined, as it needs two players', async (_, joined, disabled) => {
      const { tab } = await openPlaying(registration(...joined), { powers: ORGANIZE_ONLY });

      expect(button(tab, 'Start tournament')?.disabled).toBe(disabled);
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
        completed(playing([], { trophyHolders: [carol.id] })),
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
        completed(playing([], { trophyHolders: [alice.id, bob.id] })),
        { user: dave },
      );

      expect(items(tab, 'Trophy holders')).toEqual(['Alice', 'Bob']);
    });

    it('offers Complete tournament only to organizers', async () => {
      const { tab } = await openPlaying(playing());

      expect(button(tab, 'Complete tournament')).toBeUndefined();
    });

    it('lets an organizer cancel the tournament while it is played once they go ahead, offering setup again', async () => {
      const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

      button(tab, 'Cancel tournament')!.click();
      const dialog = await question('Cancel the tournament?');
      expect(dialog.textContent).toContain(
        'Its matches are removed, nothing from it counts, and every deck unlocks.',
      );
      await answer(dialog, 'Cancel tournament');
      await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament',
        'DELETE',
        null,
        1,
        threePlayers,
      );

      expect(button(panel(page), 'Set up tournament')).toBeDefined();
    });

    it('keeps the tournament playing when the organizer thinks better of cancelling it', async () => {
      const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

      button(tab, 'Cancel tournament')!.click();
      await answer(await question('Cancel the tournament?'), 'Keep tournament');
      await fixture.whenStable();

      http.expectNone('/api/drafts/draft-1/tournament');
      expect(button(tab, 'Cancel tournament')).toBeDefined();
    });

    it('offers no Cancel tournament once the tournament is complete', async () => {
      const { tab } = await openPlaying(completed(playing()), {
        powers: ORGANIZE_ONLY,
      });

      expect(button(tab, 'Cancel tournament')).toBeUndefined();
    });

    it('offers Cancel tournament only to organizers', async () => {
      const { tab } = await openPlaying(playing());

      expect(button(tab, 'Cancel tournament')).toBeUndefined();
    });

    it.each([
      [
        'Swiss',
        swissPlaying(),
        ['Drop from tournament', 'Cancel tournament', 'Reopen round 1', 'Complete round'],
        ['Your match', 'Standings'],
      ],
      [
        'Swiss with Reopen round disabled',
        swissPlaying({
          reopenRound: {
            round: 1,
            refusal: { error: 'next-round-reported', message: 'Tournament round 2 has a match.' },
            takesBackDrops: [],
          },
        }),
        ['Drop from tournament', 'Cancel tournament', 'Reopen round 1', 'Complete round'],
        ['Your match', 'Standings'],
      ],
      [
        'single elimination',
        singleEliminationPlaying(),
        ['Drop from tournament', 'Cancel tournament', 'Complete round'],
        ['Bracket', 'Standings'],
      ],
      [
        'round robin',
        playing(),
        ['Drop from tournament', 'Cancel tournament', 'Complete tournament'],
        ['Your matches', 'Results grid'],
      ],
    ])(
      'reads the action rows in %s before Your matches and the lists, so they don’t push them out of view',
      async (_, tournament, names, regions) => {
        const { tab } = await openPlaying(tournament, { powers: ORGANIZE_ONLY });

        const actions = actionButtons(tab);
        expect(actions.map(accessibleName)).toEqual(names);
        const lists = listsAfterActions(tab);
        for (const name of regions) expect(lists).toContain(region(tab, name));
        expect(lists).toContain(namedList(tab, 'Players'));
        for (const action of actions) expectBeforeLists(tab, action);
      },
    );

    it('says why Reopen round is disabled right after its row, before Your match', async () => {
      const message = 'Tournament round 2 has a match with a game score.';
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
      expect(accessibleDescription(reopenRound)).toBe(message);
      expectByActionRows(
        tab,
        document.getElementById(reopenRound.getAttribute('aria-describedby')!)!,
      );
    });

    it('says completing the tournament round failed right after the action rows, before Your match', async () => {
      const { fixture, page, tab, dialog } = await openCompleteRound(swissPlaying());

      button(dialog, 'Complete round')!.click();

      expect(await failChange(fixture, page, COMPLETE_ROUND_URL)).toBe(
        "Couldn't complete the tournament round. Try again in a moment.",
      );
      expectByActions(page, tab);
    });

    it.each([
      {
        doing: 'cancelling the tournament',
        tournament: swissPlaying(),
        label: 'Cancel tournament',
        asked: ['Cancel the tournament?', 'Cancel tournament'],
        url: '/api/drafts/draft-1/tournament',
        failure: "Couldn't cancel the tournament. Try again in a moment.",
      },
      {
        doing: 'reopening the tournament round',
        tournament: swissPlaying(),
        label: 'Reopen round 1',
        asked: ['Reopen tournament round 1?', 'Reopen round 1'],
        url: '/api/drafts/draft-1/tournament/reopen-round',
        failure: "Couldn't reopen the tournament round. Try again in a moment.",
      },
      {
        doing: 'dropping from the tournament',
        tournament: swissPlaying(),
        label: 'Drop from tournament',
        asked: ['Drop from the tournament?', 'Drop'],
        url: `/api/drafts/draft-1/tournament/entries/${alice.id}/drop`,
        failure: "Couldn't drop from the tournament. Try again in a moment.",
      },
      {
        doing: 'completing the tournament',
        tournament: playing(),
        label: 'Complete tournament',
        asked: ['Complete the tournament?', 'Complete tournament'],
        url: '/api/drafts/draft-1/tournament/complete',
        failure: "Couldn't complete the tournament. Try again in a moment.",
      },
      {
        doing: 'cancelling the tournament in round robin',
        tournament: playing(),
        label: 'Cancel tournament',
        asked: ['Cancel the tournament?', 'Cancel tournament'],
        url: '/api/drafts/draft-1/tournament',
        failure: "Couldn't cancel the tournament. Try again in a moment.",
      },
    ] as const)(
      'says $doing failed right after the action rows, before Your matches',
      async ({ tournament, label, asked: [asked, action], url, failure }) => {
        const { fixture, page, tab } = await openPlaying(tournament, { powers: ORGANIZE_ONLY });

        button(tab, label)!.click();
        await answer(await question(asked), action);

        expect(await failChange(fixture, page, url)).toBe(failure);
        expectByActions(page, tab);
      },
    );

    it('says starting the tournament failed right after the registration row, before Joined players', async () => {
      const { fixture, page, tab } = await openPlaying(registration(alice.id, bob.id, carol.id), {
        powers: ORGANIZE_ONLY,
      });

      button(tab, 'Start tournament')!.click();
      await answer(await question('Start the tournament?'), 'Start');

      expect(await failChange(fixture, page, '/api/drafts/draft-1/tournament/start')).toBe(
        "Couldn't start the tournament. Try again in a moment.",
      );
      expectByRegistration(page, tab);
    });
  });
});
