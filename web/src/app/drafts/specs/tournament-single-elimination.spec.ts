import type { TournamentView } from 'contract';
import { openDialog } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  alice,
  bob,
  button,
  controlByLabel,
  group,
  items,
  panel,
  text,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  carol,
  dave,
  openComplete,
  openMatch,
  openPlaying,
  openTournament,
  registration,
  reported,
  roundLabels,
  singleEliminationPlaying,
  threePlayers,
} from './tournament-tab-harness';

useDraftsApp();

/** Round 1 completed, Carol having beaten Bob 2–1, and the final of Alice and Carol unreported (m2). */
const final = singleEliminationPlaying({
  lastCompletedRound: 1,
  rounds: [
    {
      round: 1,
      matches: [
        { ...reported(openMatch('m1', bob.id, carol.id), [1, 2], carol.id), bracketPlace: 1 },
      ],
      byes: [alice.id],
    },
    { round: 2, matches: [{ ...openMatch('m2', alice.id, carol.id), bracketPlace: 0 }], byes: [] },
  ],
});

/** Opens the Complete round dialog for an organizer, on `tournament`. */
async function openCompleteRound(tournament: TournamentView) {
  const opened = await openPlaying(tournament, { powers: ORGANIZE_ONLY });
  button(opened.tab, 'Complete round')!.click();
  await opened.fixture.whenStable();
  return opened;
}

describe('single elimination tournaments on the Tournament tab', () => {
  it('offers single elimination at setup, with no round option', async () => {
    const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });
    const tab = await openTournament(fixture, page);

    controlByLabel(tab, 'radio', 'Single elimination')!.click();
    await fixture.whenStable();
    expect(group(tab, 'Swiss round option')).toBeNull();
    button(tab, 'Set up tournament')!.click();
    const req = await answerChange(fixture, '/api/drafts/draft-1/tournament', 'POST', {
      ...registration(alice.id, bob.id, carol.id),
      format: 'SingleElimination',
      roundCount: 2,
    });

    expect(req.request.body).toEqual({ format: 'SingleElimination' });
  });

  it('lists the matches by tournament round with each player’s seed, and the byes', async () => {
    const { tab } = await openPlaying(final, { user: dave });

    expect(text(tab)).toContain('Single elimination: 2 tournament rounds');
    expect(roundLabels(tab)).toEqual(['Tournament round 1', 'Tournament round 2']);
    expect(items(tab, 'Tournament round 1')).toEqual([
      'Bob (seed 2) 1–2 Carol (seed 3)',
      'Alice (seed 1) has a bye',
    ]);
    expect(items(tab, 'Tournament round 2')).toEqual([
      'Alice (seed 1) vs Carol (seed 3) · Unreported',
    ]);
  });

  it('shows a match won by the organizer’s pick as a granted win', async () => {
    const { tab } = await openPlaying(
      singleEliminationPlaying({
        lastCompletedRound: 1,
        rounds: [
          {
            round: 1,
            matches: [
              {
                ...openMatch('m1', bob.id, carol.id),
                bracketPlace: 1,
                outcome: { kind: 'GrantedWin', winner: bob.id },
              },
            ],
            byes: [alice.id],
          },
        ],
      }),
      { user: dave },
    );

    expect(items(tab, 'Tournament round 1')).toContain(
      'Bob (seed 2) vs Carol (seed 3) · Granted win for Bob',
    );
  });

  it('asks the organizer to pick the winner of each unreported match before completing the round', async () => {
    const { fixture } = await openCompleteRound(singleEliminationPlaying());
    const dialog = openDialog()!;

    expect(text(dialog)).toContain('Tournament round 2 is paired, and its matches open.');
    expect(text(dialog)).toContain('Pick the winner of each unreported match: they advance.');
    expect(group(dialog, 'Drop from Bob vs Carol')).toBeNull();
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

  it('offers no Clear for a match of a completed tournament round, whose winner has advanced', async () => {
    const { fixture, tab } = await openPlaying(final, { powers: ORGANIZE_ONLY });

    button(tab, 'Correct Bob vs Carol')!.click();
    await fixture.whenStable();

    expect(group(tab, 'Game score of Bob vs Carol')).not.toBeNull();
    expect(button(tab, 'Clear game score')).toBeUndefined();
  });
});
