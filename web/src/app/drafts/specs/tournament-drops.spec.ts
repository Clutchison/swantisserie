import type { MatchView, TournamentView } from 'contract';
import { ORGANIZE_ONLY, alice, bob, button, namedList, panel, useDraftsApp } from './harness';
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

/** Each item's text in the list named `name`. */
const items = (root: HTMLElement, name: string) =>
  [...namedList(root, name).querySelectorAll('li')].map((li) => text(li));

/** Each player in the Players list as it reads, leaving out its buttons. */
const players = (root: HTMLElement) =>
  [...namedList(root, 'Players').querySelectorAll('li')].map((li) => {
    const shown = li.cloneNode(true) as HTMLElement;
    shown.querySelectorAll('button').forEach((b) => b.remove());
    return text(shown);
  });

/** `match` forfeited by the player `forfeitedBy`. */
const forfeited = (match: MatchView, forfeitedBy: string): MatchView => ({
  ...match,
  outcome: { kind: 'Forfeit', forfeitedBy },
});

/**
 * The tournament of Alice, Bob and Carol being played, the players with
 * these ids dropped and `matches` replacing any of its matches by id.
 */
const withDrops = (droppedIds: string[], matches: MatchView[] = []): TournamentView => {
  const tournament = playing(matches);
  return {
    ...tournament,
    entries: tournament.entries.map((entry) => ({
      ...entry,
      dropped: droppedIds.includes(entry.playerId),
    })),
  };
};

/** Carol dropped, after beating Bob: her match against Alice (m3) is a forfeit. */
const carolDropped = withDrops(
  [carol.id],
  [
    reported(openMatch('m1', bob.id, carol.id), [0, 2], carol.id),
    forfeited(openMatch('m3', carol.id, alice.id), carol.id),
  ],
);

/** Opens the Tournament tab of the draft of Alice, Bob and Carol, with `tournament`. */
async function openPlaying(
  tournament: TournamentView,
  options: Parameters<typeof openComplete>[1] = {},
) {
  const opened = await openComplete(tournament, { fields: threePlayers, ...options });
  const tab = await openTournament(opened.fixture, opened.page);
  return { ...opened, tab };
}

describe('drops on the tournament tab', () => {
  it('shows dropped players and their forfeits', async () => {
    const { tab } = await openPlaying(carolDropped, { user: dave });

    expect(players(tab)).toEqual(['Alice', 'Bob', 'Carol · Dropped']);
    expect(items(tab, 'Tournament round 3')).toEqual([
      'Carol vs Alice · Carol forfeited',
      'Bob has a bye',
    ]);
  });

  it('lets a player drop from the tournament once they confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page, tab } = await openPlaying(playing());

    button(tab, 'Drop from tournament')!.click();
    expect(confirm).toHaveBeenCalledWith(
      'Drop from the tournament? Your unplayed matches become forfeits, and only an organizer can take it back. Your deck stays locked until the tournament is complete.',
    );
    await answerChange(
      fixture,
      `/api/drafts/draft-1/tournament/entries/${alice.id}/drop`,
      'POST',
      withDrops(
        [alice.id],
        [
          forfeited(openMatch('m2', alice.id, bob.id), alice.id),
          forfeited(openMatch('m3', carol.id, alice.id), alice.id),
        ],
      ),
      1,
      threePlayers,
    );

    expect(players(panel(page))).toEqual(['Alice · Dropped', 'Bob', 'Carol']);
    expect(button(panel(page), 'Drop from tournament')).toBeUndefined();
    expect(panel(page).querySelector('section[aria-label="Your match"]')).toBeNull();
  });

  it('sends nothing when the player doesn’t confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { fixture, tab } = await openPlaying(playing());

    button(tab, 'Drop from tournament')!.click();
    await fixture.whenStable();

    expect(button(tab, 'Drop from tournament')).toBeDefined();
  });

  it('offers a player no Drop for anyone else, nor Undo drop', async () => {
    const { tab } = await openPlaying(carolDropped);

    expect(button(tab, 'Drop from tournament')).toBeDefined();
    expect(button(tab, 'Drop Bob')).toBeUndefined();
    expect(button(tab, 'Undo drop Carol')).toBeUndefined();
  });

  it('offers a viewer who didn’t join no Drop', async () => {
    const { tab } = await openPlaying(carolDropped, { user: dave });

    expect(button(tab, 'Drop from tournament')).toBeUndefined();
  });

  it('lets an organizer drop a player once they confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Drop Bob')!.click();
    expect(confirm).toHaveBeenCalledWith(
      'Drop Bob from the tournament? Their unplayed matches become forfeits.',
    );
    await answerChange(
      fixture,
      `/api/drafts/draft-1/tournament/entries/${bob.id}/drop`,
      'POST',
      withDrops([bob.id]),
      1,
      threePlayers,
    );

    expect(players(panel(page))).toContain('Bob · Dropped');
    expect(button(panel(page), 'Undo drop Bob')).toBeDefined();
  });

  it('lets an organizer undo a drop', async () => {
    const { fixture, page, tab } = await openPlaying(carolDropped, { powers: ORGANIZE_ONLY });
    expect(button(tab, 'Drop Carol')).toBeUndefined();

    button(tab, 'Undo drop Carol')!.click();
    await answerChange(
      fixture,
      `/api/drafts/draft-1/tournament/entries/${carol.id}/drop`,
      'DELETE',
      playing([reported(openMatch('m1', bob.id, carol.id), [0, 2], carol.id)]),
      1,
      threePlayers,
    );

    expect(players(panel(page))).toEqual(['Alice', 'Bob', 'Carol']);
    expect(items(panel(page), 'Tournament round 3')[0]).toContain('Carol vs Alice · Unreported');
  });

  it('offers no Drop or Undo drop once the tournament is complete', async () => {
    const { tab } = await openPlaying(
      { ...carolDropped, state: 'Complete' },
      { powers: ORGANIZE_ONLY },
    );

    expect(players(tab)).toEqual(['Alice', 'Bob', 'Carol · Dropped']);
    expect(button(tab, 'Drop Bob')).toBeUndefined();
    expect(button(tab, 'Undo drop Carol')).toBeUndefined();
    expect(button(tab, 'Drop from tournament')).toBeUndefined();
  });
});
