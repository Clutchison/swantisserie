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
  swissPlaying,
  threePlayers,
} from './tournament-tab-harness';

useDraftsApp();

/** A Swiss tournament in registration, joined by Alice, Bob and Carol, capped at 3 tournament rounds. */
const swissRegistration = {
  ...registration(alice.id, bob.id, carol.id),
  format: 'Swiss',
  swissRoundOption: 'CappedAt3',
  roundCount: 2,
} as const;

describe('Swiss tournaments on the Tournament tab', () => {
  it('offers Swiss at setup with its round option, until there’s a winner unless capped at 3', async () => {
    const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });
    const tab = await openTournament(fixture, page);

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

    expect(req.request.body).toEqual({ format: 'Swiss', swissRoundOption: 'CappedAt3' });
  });

  it('shows how many tournament rounds it will have', async () => {
    const { tab } = await openPlaying(swissRegistration, { user: dave });

    expect(text(tab)).toContain('Swiss, capped at 3: 2 tournament rounds');
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

  it('lets an organizer complete the round once they confirm, in place of completing the tournament', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page, tab } = await openPlaying(
      swissPlaying({
        rounds: [
          swissPlaying().rounds[0],
          {
            round: 2,
            matches: [reported(openMatch('m2', alice.id, carol.id), [2, 1], alice.id)],
            bye: bob.id,
          },
        ],
      }),
      { powers: ORGANIZE_ONLY },
    );
    expect(button(tab, 'Complete tournament')).toBeUndefined();

    button(tab, 'Complete round')!.click();
    expect(confirm).toHaveBeenCalledWith(
      'Complete tournament round 2? It is the last, so the tournament completes and the trophy is awarded.',
    );
    await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/complete-round',
      'POST',
      swissPlaying({ state: 'Complete', lastCompletedRound: 2, trophyHolders: [alice.id] }),
      1,
      threePlayers,
    );

    expect(items(panel(page), 'Trophy holders')).toEqual(['Alice']);
    expect(button(panel(page), 'Complete round')).toBeUndefined();
  });

  it('asks before pairing the next tournament round', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const roundOne = {
      round: 1,
      matches: [reported(openMatch('m1', carol.id, bob.id), [2, 0], carol.id)],
      bye: alice.id,
    };
    const { tab } = await openPlaying(swissPlaying({ lastCompletedRound: 0, rounds: [roundOne] }), {
      powers: ORGANIZE_ONLY,
    });

    button(tab, 'Complete round')!.click();

    expect(confirm).toHaveBeenCalledWith(
      'Complete tournament round 1? Tournament round 2 is paired, and its matches open.',
    );
  });

  it('offers Complete round only to organizers', async () => {
    const { tab } = await openPlaying(swissPlaying());

    expect(button(tab, 'Complete round')).toBeUndefined();
  });
});
