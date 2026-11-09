import {
  answer,
  clickBackdrop,
  openDialog,
  pressEscape,
  question,
  table,
} from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  type AppFixture,
  accessibleDescription,
  alertIn,
  alice,
  bob,
  button,
  buttonOrder,
  draft,
  flushPicks,
  group,
  heading,
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
  erin,
  failChange,
  forfeited,
  fourPlayers,
  grantedDraw,
  gridCell,
  gridCellName,
  gridColumns,
  gridRows,
  unreportedMatch,
  openPlaying,
  playing,
  progressLine,
  pushTournament,
  registration,
  reported,
  resultsGrid,
  roundRobinOfFour,
  roundLabels,
  standing,
  threePlayers,
  withDrops,
  withTournament,
  yourMatches,
  completed,
  confirmedMatch,
} from './play-tab-harness';

useDraftsApp();

/** Bob reporting that he beat Alice 2–1 in match m2. */
const bobBeatAlice = reported(unreportedMatch('m2', alice.id, bob.id), [1, 2], bob.id);

/** Alice's unreported matches against Bob (m2), Carol (m3) and Erin (m4). */
const [againstBob, againstCarol, againstErin] = [
  unreportedMatch('m2', alice.id, bob.id),
  unreportedMatch('m3', carol.id, alice.id),
  unreportedMatch('m4', alice.id, erin.id),
];

/** Presses Report on the line of the match against `opponent` in Your matches, and returns the dialog it opens. */
async function openReport(fixture: AppFixture, tab: HTMLElement, opponent: string) {
  button(tab, `Report your match against ${opponent}`)!.click();
  await fixture.whenStable();
  return question(`Your match against ${opponent}`);
}

describe('Play tab while the tournament is played', () => {
  describe('your matches', () => {
    it('lists one line per opponent, unreported first, with a link to your Deck tab', async () => {
      const { fixture, page, tab } = await openPlaying(
        playing([reported(unreportedMatch('m2', alice.id, bob.id), [2, 1], alice.id)]),
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
          reported(unreportedMatch('m2', alice.id, bob.id), [1, 2], bob.id),
          confirmedMatch(reported(unreportedMatch('m3', carol.id, alice.id), [2, 0], alice.id)),
        ]),
      );

      expect(yourMatches(tab)).toEqual([
        'Bob reported you lost 1–2',
        'vs Carol · Lost 0–2 · Confirmed',
      ]);
      expect(button(tab, 'Confirm your match against Bob')).toBeDefined();
      expect(button(tab, 'Confirm your match against Carol')).toBeUndefined();
    });

    it('says an organizer reported a game score you can confirm', async () => {
      const { tab } = await openPlaying(
        playing([reported(unreportedMatch('m2', alice.id, bob.id), [2, 1], dave.id)]),
      );

      expect(yourMatches(tab)).toContain('An organizer reported you won 2–1');
      expect(button(tab, 'Confirm your match against Bob')).toBeDefined();
    });

    it('shows a forfeit by an opponent who dropped', async () => {
      const { tab } = await openPlaying(
        withDrops([carol.id], [forfeited(unreportedMatch('m3', carol.id, alice.id), carol.id)]),
      );

      expect(yourMatches(tab)).toEqual(['vs Bob', 'Forfeit: Carol dropped']);
      expect(button(tab, 'Report your match against Carol')).toBeUndefined();
    });

    it('reports any unreported match in any order, sending the game score in the match’s player order', async () => {
      const { fixture, tab } = await openPlaying(playing());

      const dialog = await openReport(fixture, tab, 'Carol');
      expect(group(tab, 'Game score against Carol')).toBeNull();
      const scores = group(dialog, 'Game score against Carol')!;
      expect([...scores.querySelectorAll('button')].map((b) => text(b))).toEqual([
        'Won 2–0',
        'Won 2–1',
        'Lost 1–2',
        'Lost 0–2',
      ]);
      expect(button(dialog, 'Cancel')).toBeDefined();
      button(scores, 'Won 2–1')!.click();
      await fixture.whenStable();
      expect(text(dialog)).toContain('Report that you won 2–1 against Carol?');
      expect(text(dialog)).toContain('Only an organizer can change a reported match.');
      expect(accessibleDescription(button(dialog, 'Report')!)).toBe(
        'Report that you won 2–1 against Carol?',
      );
      expect(['Report', 'Back', 'Cancel'].map((label) => !!button(dialog, label))).toEqual([
        true,
        true,
        true,
      ]);
      await vi.waitFor(() => expect(document.activeElement).toBe(button(dialog, 'Report')));
      await answer(dialog, 'Report');
      expect(document.activeElement).toBe(button(tab, 'Report your match against Bob'));
      const req = await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/matches/m3/report',
        'POST',
        playing([reported(unreportedMatch('m3', carol.id, alice.id), [1, 2], alice.id)]),
        1,
        threePlayers,
      );

      expect(req.request.body).toEqual({ games: [1, 2] });
      expect(yourMatches(tab)).toEqual(['vs Bob', 'vs Carol · Won 2–1']);
    });

    it('moves focus to the Your matches heading once no match is left to report', async () => {
      const aliceBeatBob = reported(unreportedMatch('m2', alice.id, bob.id), [2, 0], alice.id);
      const { fixture, tab } = await openPlaying(playing([aliceBeatBob]));

      const dialog = await openReport(fixture, tab, 'Carol');
      button(group(dialog, 'Game score against Carol')!, 'Lost 0–2')!.click();
      await fixture.whenStable();
      await answer(dialog, 'Report');

      expect(document.activeElement).toBe(heading(tab, 'Your matches'));
      http.expectOne('/api/drafts/draft-1/tournament/matches/m3/report');
    });

    it('moves focus to the next match’s Report once one is reported, not back to the first', async () => {
      const { fixture, tab } = await openPlaying(
        roundRobinOfFour([againstBob, againstCarol, againstErin]),
        { fields: fourPlayers },
      );

      const dialog = await openReport(fixture, tab, 'Carol');
      button(group(dialog, 'Game score against Carol')!, 'Won 2–0')!.click();
      await fixture.whenStable();
      await answer(dialog, 'Report');

      expect(document.activeElement).toBe(button(tab, 'Report your match against Erin'));
      http.expectOne('/api/drafts/draft-1/tournament/matches/m3/report');
    });

    it('lists your opponents in join order, whatever order the read gives their matches', async () => {
      const { tab } = await openPlaying(roundRobinOfFour([againstErin, againstCarol, againstBob]), {
        fields: fourPlayers,
      });

      expect(yourMatches(tab)).toEqual(['vs Bob', 'vs Carol', 'vs Erin']);
    });

    it('goes back from the question to the game scores, focus on the one picked, sending nothing', async () => {
      const { fixture, tab } = await openPlaying(playing());
      const dialog = await openReport(fixture, tab, 'Bob');
      button(group(dialog, 'Game score against Bob')!, 'Lost 1–2')!.click();
      await fixture.whenStable();

      button(dialog, 'Back')!.click();
      await fixture.whenStable();

      const scores = group(dialog, 'Game score against Bob')!;
      await vi.waitFor(() => expect(document.activeElement).toBe(button(scores, 'Lost 1–2')));
      expect(text(dialog)).not.toContain('Report that you');
      http.expectNone('/api/drafts/draft-1/tournament/matches/m2/report');
    });

    const dismissals = [
      ['Cancel', () => button(openDialog()!, 'Cancel')!.click()],
      ['Escape', () => pressEscape()],
      ['a click outside', () => clickBackdrop()],
    ] as const;
    it.each(
      dismissals.flatMap(([how, dismiss]) => [
        [how, 'the game scores', false, dismiss] as const,
        [how, 'the question', true, dismiss] as const,
      ]),
    )('sends nothing when %s closes the dialog on %s', async (_, __, picked, dismiss) => {
      const { fixture, tab } = await openPlaying(playing());
      const opener = button(tab, 'Report your match against Bob')!;
      opener.focus();
      const dialog = await openReport(fixture, tab, 'Bob');
      if (picked) {
        button(group(dialog, 'Game score against Bob')!, 'Won 2–0')!.click();
        await fixture.whenStable();
      }

      dismiss();
      await vi.waitFor(() => expect(openDialog()).toBeNull());
      await fixture.whenStable();

      expect(document.activeElement).toBe(opener);
      http.expectNone('/api/drafts/draft-1/tournament/matches/m2/report');
    });

    it.each([
      ['the game scores', false],
      ['the question', true],
    ])(
      'keeps the dialog open on %s when another match is reported, and closes it once its match is',
      async (_, picked) => {
        const { fixture, tab } = await openPlaying(playing());
        const dialog = await openReport(fixture, tab, 'Carol');
        if (picked) {
          button(group(dialog, 'Game score against Carol')!, 'Won 2–0')!.click();
          await fixture.whenStable();
        }

        await pushTournament(
          fixture,
          playing([reported(unreportedMatch('m1', bob.id, carol.id), [2, 0])]),
          1,
          { asPlayer: true },
        );
        expect(openDialog()).not.toBeNull();

        await pushTournament(
          fixture,
          playing([
            reported(unreportedMatch('m1', bob.id, carol.id), [2, 0]),
            reported(unreportedMatch('m3', carol.id, alice.id), [2, 0], carol.id),
          ]),
          2,
          { asPlayer: true },
        );
        await vi.waitFor(() => expect(openDialog()).toBeNull());
        http.expectNone('/api/drafts/draft-1/tournament/matches/m3/report');
      },
    );

    it('confirms an opponent’s report from its line', async () => {
      const { fixture, tab } = await openPlaying(playing([bobBeatAlice]));

      button(tab, 'Confirm your match against Bob')!.click();
      const req = await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/matches/m2/confirm',
        'POST',
        playing([confirmedMatch(bobBeatAlice)]),
        1,
        threePlayers,
      );

      expect(req.request.body).toBeNull();
      expect(yourMatches(tab)).toEqual(['vs Carol', 'vs Bob · Lost 1–2 · Confirmed']);
    });

    it('puts Report before Confirm on a line that offers both', async () => {
      // The api offers Confirm only on a reported match, so no line offers both today; the order still holds if one does.
      const { tab } = await openPlaying(
        playing([{ ...unreportedMatch('m2', alice.id, bob.id), confirmableBy: [alice.id] }]),
      );

      expect(buttonOrder(tab, 'Confirm your match against Bob')).toEqual([
        'Report your match against Bob',
        'Confirm your match against Bob',
      ]);
    });

    it('says why a report was refused', async () => {
      const { fixture, page, tab } = await openPlaying(playing());

      const dialog = await openReport(fixture, tab, 'Bob');
      button(group(dialog, 'Game score against Bob')!, 'Won 2–0')!.click();
      await fixture.whenStable();
      await answer(dialog, 'Report');
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

    it('says reporting failed when the api gives no reason', async () => {
      const { fixture, page, tab } = await openPlaying(playing());

      const dialog = await openReport(fixture, tab, 'Bob');
      button(group(dialog, 'Game score against Bob')!, 'Won 2–0')!.click();
      await fixture.whenStable();
      await answer(dialog, 'Report');

      expect(
        await failChange(fixture, page, '/api/drafts/draft-1/tournament/matches/m2/report'),
      ).toBe("Couldn't report the match. Try again in a moment.");
    });

    it('says confirming failed when the api gives no reason', async () => {
      const { fixture, page, tab } = await openPlaying(playing([bobBeatAlice]));

      button(tab, 'Confirm your match against Bob')!.click();

      expect(
        await failChange(fixture, page, '/api/drafts/draft-1/tournament/matches/m2/confirm'),
      ).toBe("Couldn't confirm the match. Try again in a moment.");
    });

    it('is absent for a viewer who didn’t join', async () => {
      const { tab } = await openPlaying(playing(), { user: dave });

      expect(region(tab, 'Your matches')).toBeNull();
      expect(region(tab, 'Your match')).toBeNull();
    });

    describe('confirming a match', () => {
      it('isn’t offered to viewers who aren’t the match’s players', async () => {
        const { tab } = await openPlaying(playing([bobBeatAlice]), { user: dave });

        expect(text(tab)).not.toContain('Confirm');
      });

      it('is offered to a player who dropped on a match their opponent reported, with no Report or Drop', async () => {
        const { tab } = await openPlaying(
          withDrops(
            [alice.id],
            [bobBeatAlice, forfeited(unreportedMatch('m3', carol.id, alice.id), alice.id)],
          ),
        );

        expect(yourMatches(tab)).toEqual([
          'Bob reported you lost 1–2',
          'Forfeit: you dropped against Carol',
        ]);
        expect(button(tab, 'Report your match against Carol')).toBeUndefined();
        expect(button(tab, 'Drop from tournament')).toBeUndefined();

        button(tab, 'Confirm your match against Bob')!.click();
        const req = await vi.waitFor(() =>
          http.expectOne('/api/drafts/draft-1/tournament/matches/m2/confirm'),
        );
        expect(req.request.method).toBe('POST');
      });
    });
  });

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
        'starting',
        registration(alice.id, bob.id, carol.id),
        'Start tournament',
        ['Start the tournament?', 'Start'],
        '/api/drafts/draft-1/tournament/start',
        "Couldn't start the tournament. Try again in a moment.",
      ],
      [
        'completing',
        playing(),
        'Complete tournament',
        ['Complete the tournament?', 'Complete tournament'],
        '/api/drafts/draft-1/tournament/complete',
        "Couldn't complete the tournament. Try again in a moment.",
      ],
      [
        'cancelling',
        playing(),
        'Cancel tournament',
        ['Cancel the tournament?', 'Cancel tournament'],
        '/api/drafts/draft-1/tournament',
        "Couldn't cancel the tournament. Try again in a moment.",
      ],
    ] as const)(
      'says %s the tournament failed when the api gives no reason',
      async (_, tournament, label, [asked, action], url, failure) => {
        const { fixture, page, tab } = await openPlaying(tournament, { powers: ORGANIZE_ONLY });

        button(tab, label)!.click();
        await answer(await question(asked), action);

        expect(await failChange(fixture, page, url)).toBe(failure);
      },
    );
  });
});

describe('Play tab once the tournament is complete', () => {
  it('shows a match left unreported as the granted draw completing made it', async () => {
    const { tab } = await openPlaying(
      completed(playing([grantedDraw(unreportedMatch('m2', alice.id, bob.id))])),
    );

    expect(yourMatches(tab)).toContain('vs Bob · Granted draw');
  });

  it('lets the opponent confirm once the tournament is complete', async () => {
    const completeWith = (m2: ReturnType<typeof unreportedMatch>) =>
      completed(playing([m2], { trophyHolders: [bob.id] }));
    const { fixture, tab } = await openPlaying(completeWith(bobBeatAlice));

    button(tab, 'Confirm your match against Bob')!.click();
    await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m2/confirm',
      'POST',
      completeWith(confirmedMatch(bobBeatAlice)),
      1,
      threePlayers,
    );

    expect(yourMatches(tab)).toContain('vs Bob · Lost 1–2 · Confirmed');
    expect(text(gridCell(tab, 'Bob', 'Alice'))).toBe('2–1');
  });
});
