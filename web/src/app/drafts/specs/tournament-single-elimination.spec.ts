import type { PlayerView, ViewerTournamentView } from 'contract';
import { openDialog, question } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  alice,
  alicePlayer,
  bob,
  button,
  controlByLabel,
  group,
  http,
  items,
  panel,
  text,
  useDraftsApp,
} from './harness';
import {
  announcements,
  answerChange,
  carol,
  dave,
  openComplete,
  openCompleteRound,
  openPlaying,
  openPlayTab,
  place,
  progressLine,
  pushTournament,
  registration,
  side,
  singleEliminationFinal as final,
  singleEliminationPlaying,
  standing,
  standingsColumns,
  threePlayers,
  unreportedMatch,
  winnerToCome,
  completed,
} from './play-tab-harness';

useDraftsApp();

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
    const { fixture, dialog } = await openCompleteRound(singleEliminationPlaying());

    expect(await question('Complete tournament round 1')).toBe(dialog);
    expect(text(dialog)).toContain(
      'Completing the round will pair tournament round 2 and open its matches.',
    );
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

    expect(req.request.body).toEqual({
      round: 1,
      grantedWins: [{ matchId: 'm1', winner: carol.id }],
    });
    await vi.waitFor(() => expect(openDialog()).toBeNull());
  });

  it('shows the standings without Swiss’s tiebreak columns', async () => {
    const { tab } = await openPlaying(singleEliminationPlaying(), { user: dave });

    expect(standingsColumns(tab)).toEqual([
      'Rank',
      'Player',
      'Match points',
      'Matches won, lost and drawn',
      'Game-win %',
    ]);
  });

  it.each([
    ['a 2-player bracket’s only round', 1, 0, 'Final'],
    ['a 4-player bracket’s first round', 2, 0, 'Semifinal'],
    ['a 4-player bracket’s last round', 2, 1, 'Final'],
    ['a 16-player bracket’s first round', 4, 0, 'Tournament round 1 of 4'],
    ['a 16-player bracket’s second round', 4, 1, 'Quarterfinal'],
    ['a 16-player bracket’s third round', 4, 2, 'Semifinal'],
  ])('names %s while it is playing', async (_, roundCount, lastCompletedRound, line) => {
    const { tab } = await openPlaying(singleEliminationPlaying({ roundCount, lastCompletedRound }));

    expect(progressLine(tab)).toBe(line);
  });

  it('announces the final once it is reached', async () => {
    const { fixture, tab } = await openPlaying(singleEliminationPlaying(), { user: dave });
    expect(announcements(tab)).toEqual([]);

    await pushTournament(fixture, final, 1);

    expect(announcements(tab)).toEqual(['Final']);
  });

  it('names no tournament round once it is complete', async () => {
    const { tab } = await openPlaying(completed(final));

    expect(progressLine(tab)).toBe('');
  });

  it('completes the tournament with the final, awarding the trophy', async () => {
    const { fixture, page, dialog } = await openCompleteRound(final);

    expect(text(dialog)).toContain(
      'It is the final tournament round, so completing it will complete the tournament and award the trophy.',
    );
    controlByLabel(group(dialog, 'Winner of Alice vs Carol')!, 'radio', 'Alice')!.click();
    await fixture.whenStable();
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      completed({ ...final, lastCompletedRound: 2, trophyHolders: [alice.id] }),
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({
      round: 2,
      grantedWins: [{ matchId: 'm2', winner: alice.id }],
    });
    expect(items(panel(page), 'Trophy holders')).toEqual(['Alice']);
  });

  it('closes the dialog, sending nothing, once another organizer completes the tournament round', async () => {
    const { fixture } = await openCompleteRound(singleEliminationPlaying(), { user: dave });

    await pushTournament(fixture, final, 1);

    await vi.waitFor(() => expect(openDialog()).toBeNull());
    http.expectNone('/api/drafts/draft-1/tournament/complete-round');
  });
});

describe('dropping players from the single elimination Complete round dialog', () => {
  it('drops a player from an unreported match instead of picking its winner', async () => {
    const { fixture, dialog } = await openCompleteRound(singleEliminationPlaying());

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

    expect(req.request.body).toEqual({ round: 1, drops: [{ matchId: 'm1', drop: [bob.id] }] });
  });

  it('says the tournament completes when dropping both players leaves one player in the bracket', async () => {
    const { fixture, dialog } = await openCompleteRound(singleEliminationPlaying());
    const drops = group(dialog, 'Drop from Bob vs Carol')!;

    controlByLabel(drops, 'checkbox', 'Drop Bob')!.click();
    controlByLabel(drops, 'checkbox', 'Drop Carol')!.click();
    await fixture.whenStable();

    expect(text(dialog)).toContain(
      'Fewer than 2 players will be left in the bracket, so completing the round will complete the tournament and award the trophy.',
    );
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      completed({ ...final, trophyHolders: [alice.id] }),
      1,
      threePlayers,
    );
    expect(req.request.body).toEqual({
      round: 1,
      drops: [{ matchId: 'm1', drop: [bob.id, carol.id] }],
    });
  });
});

describe('both finalists dropping', () => {
  it('says nobody holds the trophy, from the dialog to the completed tournament', async () => {
    const { fixture, page, dialog } = await openCompleteRound(final);
    const drops = group(dialog, 'Drop from Alice vs Carol')!;

    controlByLabel(drops, 'checkbox', 'Drop Alice')!.click();
    controlByLabel(drops, 'checkbox', 'Drop Carol')!.click();
    await fixture.whenStable();

    expect(text(dialog)).toContain(
      'It is the final tournament round, so completing it will complete the tournament. Nobody will advance from the final, so nobody will hold the trophy.',
    );
    expect(text(dialog)).not.toContain('award the trophy');
    button(dialog, 'Complete round')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      completed({ ...final, lastCompletedRound: 2, trophyHolders: [] }),
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({
      round: 2,
      drops: [{ matchId: 'm2', drop: [alice.id, carol.id] }],
    });
    expect(text(panel(page))).toContain('Nobody holds the trophy');
  });

  it('still awards the trophy when one finalist drops', async () => {
    const { fixture, dialog } = await openCompleteRound(final);

    controlByLabel(group(dialog, 'Drop from Alice vs Carol')!, 'checkbox', 'Drop Alice')!.click();
    await fixture.whenStable();

    expect(text(dialog)).toContain('award the trophy');
  });
});

/** Erin, a fourth player. */
const erin: PlayerView = { ...bob, id: 'erin', name: 'Erin' };

/**
 * A single elimination tournament of Alice, Bob, Carol and Erin, seeded in
 * that order, in its semifinal: Alice plays Erin (m1) and Bob plays Carol
 * (m2), both unreported, or m1 forfeited by Alice once she and Erin both
 * dropped, so that nobody advances from it.
 */
function semifinalOfFour({ bothDropped = false } = {}): ViewerTournamentView {
  const m1 = { ...unreportedMatch('m1', alice.id, erin.id), bracketPlace: 0 };
  return singleEliminationPlaying({
    entries: [alice.id, bob.id, carol.id, erin.id].map((playerId, i) => ({
      playerId,
      dropped: bothDropped && (playerId === alice.id || playerId === erin.id),
      droppable: true,
      seed: i + 1,
    })),
    rounds: [
      {
        round: 1,
        correctable: true,
        matches: [
          bothDropped ? { ...m1, outcome: { kind: 'Forfeit', forfeitedBy: alice.id } } : m1,
          { ...unreportedMatch('m2', bob.id, carol.id), bracketPlace: 1 },
        ],
        byes: [],
      },
    ],
    bracket: [
      {
        round: 1,
        places: [
          place(0, 'm1', [side(alice.id), side(erin.id)]),
          place(1, 'm2', [side(bob.id), side(carol.id)]),
        ],
      },
      {
        round: 2,
        places: [
          place(
            0,
            null,
            bothDropped ? [winnerToCome(1), { kind: 'Bye' }] : [winnerToCome(0), winnerToCome(1)],
          ),
        ],
      },
    ],
    standings: [alice.id, bob.id, carol.id, erin.id].map((id) => standing(id, 1)),
  });
}

describe('the single elimination Complete round dialog with more than one match', () => {
  const fourPlayers = { players: [alicePlayer, bob, carol, erin] };

  it('stays disabled until every unreported match has a winner picked', async () => {
    const { fixture, dialog } = await openCompleteRound(semifinalOfFour(), { fields: fourPlayers });

    controlByLabel(group(dialog, 'Winner of Alice vs Erin')!, 'radio', 'Alice')!.click();
    await fixture.whenStable();
    expect(button(dialog, 'Complete round')!.disabled).toBe(true);

    controlByLabel(group(dialog, 'Winner of Bob vs Carol')!, 'radio', 'Carol')!.click();
    await fixture.whenStable();
    expect(button(dialog, 'Complete round')!.disabled).toBe(false);
  });

  it('counts a match already decided, beside the unreported one, in what completing the round does', async () => {
    const { dialog } = await openCompleteRound(semifinalOfFour({ bothDropped: true }), {
      fields: fourPlayers,
    });

    expect(group(dialog, 'Winner of Alice vs Erin')).toBeNull();
    expect(text(dialog)).toContain(
      'Fewer than 2 players will be left in the bracket, so completing the round will complete the tournament and award the trophy.',
    );
  });
});
