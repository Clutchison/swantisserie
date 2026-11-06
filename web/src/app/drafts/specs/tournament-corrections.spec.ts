import type { TournamentView } from 'contract';
import { ORGANIZE_ONLY, alice, bob, button, http, namedList, panel, useDraftsApp } from './harness';
import {
  answerChange,
  carol,
  dave,
  openComplete,
  openMatch,
  openTournament,
  playing,
  reported,
  threePlayers,
} from './tournament-tab-harness';

useDraftsApp();

/** `element`'s text, its whitespace collapsed. */
const text = (element: Element | null | undefined) =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The text of the first item in the list named `name`: its round's match. */
const firstItem = (root: HTMLElement, name: string) =>
  text(namedList(root, name).querySelector('li'));

/** The group of controls inside `root` named `name`. */
const group = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLElement>(`[role="group"][aria-label="${name}"]`);

/** Opens the Tournament tab of the draft of Alice, Bob and Carol, with `tournament`. */
async function openPlaying(
  tournament: TournamentView,
  options: Parameters<typeof openComplete>[1] = {},
) {
  const opened = await openComplete(tournament, { fields: threePlayers, ...options });
  const tab = await openTournament(opened.fixture, opened.page);
  return { ...opened, tab };
}

/** Bob reporting that he beat Alice 2–1 in match m2. */
const bobBeatAlice = reported(openMatch('m2', alice.id, bob.id), [1, 2], bob.id);

describe('confirming a match', () => {
  it('lets the opponent of the player who reported it confirm its game score, which then shows as confirmed', async () => {
    const { fixture, page, tab } = await openPlaying(playing([bobBeatAlice]));

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
    expect(firstItem(panel(page), 'Tournament round 2')).toBe('Alice 1–2 Bob · Confirmed');
    expect(button(panel(page), 'Confirm your match against Bob')).toBeUndefined();
  });

  it('shows a confirmed match as confirmed to everyone', async () => {
    const m1 = { ...reported(openMatch('m1', bob.id, carol.id), [2, 1]), confirmed: true };
    const { tab } = await openPlaying(playing([m1]), { user: dave });

    expect(firstItem(tab, 'Tournament round 1')).toBe('Bob 2–1 Carol · Confirmed');
  });

  it('isn’t offered to the player who reported it, or for a match that isn’t reported', async () => {
    const aliceBeatBob = reported(openMatch('m2', alice.id, bob.id), [2, 0], alice.id);
    const { tab } = await openPlaying(playing([aliceBeatBob]));

    expect(button(tab, 'Confirm your match against Bob')).toBeUndefined();
    expect(button(tab, 'Confirm your match against Carol')).toBeUndefined();
  });

  it('isn’t offered to viewers who aren’t the match’s players', async () => {
    const { tab } = await openPlaying(playing([bobBeatAlice]), { user: dave });

    expect(text(tab)).not.toContain('Confirm');
  });
});

describe('organizer results', () => {
  it('lets an organizer report a match for its players', async () => {
    const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Report Bob vs Carol')!.click();
    await fixture.whenStable();
    button(group(tab, 'Result of Bob vs Carol')!, 'Carol won 2–1')!.click();
    const after = playing([reported(openMatch('m1', bob.id, carol.id), [1, 2], alice.id)]);
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m1/result',
      'PUT',
      after,
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ games: [1, 2] });
    expect(firstItem(panel(page), 'Tournament round 1')).toContain('Bob 1–2 Carol');
  });

  it('lets an organizer correct a match once the tournament is complete', async () => {
    const complete = (m1: ReturnType<typeof openMatch>, holder: string) =>
      playing([m1], { state: 'Complete', trophyHolders: [holder] });
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { fixture, page, tab } = await openPlaying(complete(m1, bob.id), {
      powers: ORGANIZE_ONLY,
    });

    button(tab, 'Correct Bob vs Carol')!.click();
    await fixture.whenStable();
    button(group(tab, 'Result of Bob vs Carol')!, 'Carol won 2–0')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m1/result',
      'PUT',
      complete(reported(m1, [0, 2], alice.id), carol.id),
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ games: [0, 2] });
    expect(text(namedList(panel(page), 'Trophy holders'))).toBe('Carol');
  });

  it('lets an organizer clear a reported match once they confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { fixture, page, tab } = await openPlaying(playing([m1]), { powers: ORGANIZE_ONLY });

    button(tab, 'Correct Bob vs Carol')!.click();
    await fixture.whenStable();
    button(group(tab, 'Result of Bob vs Carol')!, 'Clear result')!.click();
    expect(confirm).toHaveBeenCalledWith(
      'Clear the result of Bob vs Carol? The match is unreported again.',
    );
    await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m1/result',
      'DELETE',
      playing(),
      1,
      threePlayers,
    );

    expect(firstItem(panel(page), 'Tournament round 1')).toContain('Bob vs Carol · Unreported');
    expect(button(panel(page), 'Report Bob vs Carol')).toBeDefined();
  });

  it('sends nothing when the organizer doesn’t confirm clearing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { fixture, tab } = await openPlaying(playing([m1]), { powers: ORGANIZE_ONLY });

    button(tab, 'Correct Bob vs Carol')!.click();
    await fixture.whenStable();
    button(group(tab, 'Result of Bob vs Carol')!, 'Clear result')!.click();
    await fixture.whenStable();

    http.expectNone('/api/drafts/draft-1/tournament/matches/m1/result');
  });

  it('offers Clear result only for a match with a result', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Report Bob vs Carol')!.click();
    await fixture.whenStable();

    expect(button(group(tab, 'Result of Bob vs Carol')!, 'Clear result')).toBeUndefined();
  });

  it('aren’t offered to anyone without the power to organize the draft', async () => {
    const m1 = reported(openMatch('m1', bob.id, carol.id), [2, 0]);
    const { tab } = await openPlaying(playing([m1]));

    expect(button(tab, 'Correct Bob vs Carol')).toBeUndefined();
    expect(button(tab, 'Report Alice vs Bob')).toBeUndefined();
  });
});

describe('cancelling a tournament being played', () => {
  it('lets an organizer cancel it once they confirm, offering setup again', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Cancel tournament')!.click();
    expect(confirm).toHaveBeenCalledWith(
      'Cancel the tournament? Its matches are removed, nothing from it counts, and every deck unlocks.',
    );
    await answerChange(fixture, '/api/drafts/draft-1/tournament', 'DELETE', null, 1, threePlayers);

    expect(button(panel(page), 'Set up tournament')).toBeDefined();
  });

  it('isn’t offered once the tournament is complete', async () => {
    const { tab } = await openPlaying(playing([], { state: 'Complete' }), {
      powers: ORGANIZE_ONLY,
    });

    expect(button(tab, 'Cancel tournament')).toBeUndefined();
  });

  it('isn’t offered to anyone without the power to organize the draft', async () => {
    const { tab } = await openPlaying(playing());

    expect(button(tab, 'Cancel tournament')).toBeUndefined();
  });
});
