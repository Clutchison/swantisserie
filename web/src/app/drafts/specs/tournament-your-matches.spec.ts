import {
  answer,
  clickBackdrop,
  onlyAlert,
  openDialog,
  pressEscape,
  question,
} from '../../specs-harness';
import {
  type AppFixture,
  accessibleDescription,
  alertIn,
  alice,
  bob,
  button,
  draft,
  flushPicks,
  group,
  heading,
  http,
  link,
  namedList,
  panel,
  panelName,
  region,
  text,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  carol,
  dave,
  erin,
  failChange,
  forfeited,
  fourPlayers,
  grantedDraw,
  unreportedMatch,
  openPlaying,
  playing,
  pushTournament,
  reported,
  roundRobinOfFour,
  swissPlaying,
  swissRoundsWith,
  threePlayers,
  withDrops,
  entry,
  withTournament,
  yourMatches,
  confirmedMatch,
  bobBeatAlice,
  carolBeatAlice,
  completedSwiss,
} from './play-tab-harness';
import { expectAtFoot, expectByResults, expectByYourMatches } from './play-tab-placement-harness';

useDraftsApp();

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

    it('offers Report only on a match the api lists you as able to report, whatever its outcome', async () => {
      const { tab } = await openPlaying(
        playing([
          { ...unreportedMatch('m2', alice.id, bob.id), reportableBy: [bob.id] },
          { ...grantedDraw(unreportedMatch('m3', carol.id, alice.id)), reportableBy: [alice.id] },
        ]),
      );

      expect(button(tab, 'Report your match against Bob')).toBeUndefined();
      expect(button(tab, 'Report your match against Carol')).toBeDefined();
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
      // It shows by Your matches, before the results grid, not at the foot of the tab.
      expectByYourMatches(page, tab);
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
      expectByYourMatches(page, tab);
    });

    it('says confirming failed in Swiss by Your match, before the standings', async () => {
      const { fixture, page, tab } = await openPlaying(
        swissPlaying({ rounds: swissRoundsWith(carolBeatAlice) }),
      );

      button(region(tab, 'Your match')!, 'Confirm your match against Carol')!.click();
      await failChange(fixture, page, '/api/drafts/draft-1/tournament/matches/m2/confirm');

      expectByYourMatches(page, tab);
    });

    it('moves a failure to the foot of the tab once Your match is no longer shown', async () => {
      const { fixture, page, tab } = await openPlaying(
        swissPlaying({ rounds: swissRoundsWith(carolBeatAlice) }),
      );
      button(region(tab, 'Your match')!, 'Confirm your match against Carol')!.click();
      await failChange(fixture, page, '/api/drafts/draft-1/tournament/matches/m2/confirm');

      await pushTournament(fixture, completedSwiss, 1, { asPlayer: true });
      await vi.waitFor(() => expect(region(tab, 'Your match')).toBeNull());

      expect(text(onlyAlert(panel(page)))).toBe(
        "Couldn't confirm the match. Try again in a moment.",
      );
      expectAtFoot(page, namedList(tab, 'Players'));
    });

    it('says confirming from the list of matches failed by that list, before the players', async () => {
      const aliceDropped = [alice.id, bob.id, carol.id].map((id) =>
        entry(id, { dropped: id === alice.id }),
      );
      const { fixture, page, tab } = await openPlaying(
        swissPlaying({ entries: aliceDropped, rounds: swissRoundsWith(carolBeatAlice) }),
      );

      button(namedList(tab, 'Tournament round 2'), 'Confirm your match against Carol')!.click();

      expect(
        await failChange(fixture, page, '/api/drafts/draft-1/tournament/matches/m2/confirm'),
      ).toBe("Couldn't confirm the match. Try again in a moment.");
      expectByResults(page, tab);
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
});
