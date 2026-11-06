import type { TournamentView } from 'contract';
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
  withTournament,
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

  /** Round 1 of three players, Carol and Bob's match unreported and Alice with the bye. */
  const unreportedRoundOne = swissPlaying({
    lastCompletedRound: 0,
    rounds: [{ round: 1, matches: [openMatch('m1', carol.id, bob.id)], bye: alice.id }],
  });

  /** Opens the Complete round dialog for an organizer, on `tournament`. */
  async function openCompleteRound(tournament: TournamentView) {
    const opened = await openPlaying(tournament, { powers: ORGANIZE_ONLY });
    button(opened.tab, 'Complete round')!.click();
    await opened.fixture.whenStable();
    return opened;
  }

  it('asks which players of each unreported match to drop as it becomes a granted draw', async () => {
    const { fixture } = await openCompleteRound(unreportedRoundOne);
    const dialog = openDialog()!;

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(text(dialog)).toContain('Tournament round 2 is paired, and its matches open.');
    expect(text(dialog)).toContain('Its unreported matches become granted draws.');
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
      'It is the last, so the tournament completes and the trophy is awarded.',
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

  it('completes a fully reported round with no granted draws, in place of completing the tournament', async () => {
    const { fixture, tab } = await openCompleteRound(
      swissPlaying({
        lastCompletedRound: 0,
        rounds: [
          {
            round: 1,
            matches: [reported(openMatch('m1', carol.id, bob.id), [2, 0], carol.id)],
            bye: alice.id,
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

  it('shows why completing the round was refused', async () => {
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
});
