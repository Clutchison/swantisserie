import { ORGANIZE_ONLY, alice, bob, button, items, panel, region, useDraftsApp } from './harness';
import {
  answerChange,
  carol,
  dave,
  forfeited,
  openMatch,
  openPlaying,
  playerLines,
  playing,
  reported,
  threePlayers,
  withDrops,
} from './tournament-tab-harness';

useDraftsApp();

/** Carol dropped, after beating Bob: her match against Alice (m3) is a forfeit. */
const carolDropped = withDrops(
  [carol.id],
  [
    reported(openMatch('m1', bob.id, carol.id), [0, 2], carol.id),
    forfeited(openMatch('m3', carol.id, alice.id), carol.id),
  ],
);

describe('drops on the tournament tab', () => {
  it('shows dropped players and their forfeits', async () => {
    const { tab } = await openPlaying(carolDropped, { user: dave });

    expect(playerLines(tab)).toEqual(['Alice', 'Bob', 'Carol · Dropped']);
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
      'Drop from the tournament? Your unplayed matches become forfeits, and only an organizer can reinstate you. Your deck stays locked until the tournament is complete or cancelled.',
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

    expect(playerLines(panel(page))).toEqual(['Alice · Dropped', 'Bob', 'Carol']);
    expect(button(panel(page), 'Drop from tournament')).toBeUndefined();
    expect(region(panel(page), 'Your match')).toBeNull();
  });

  it('sends nothing when the player doesn’t confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { fixture, tab } = await openPlaying(playing());

    button(tab, 'Drop from tournament')!.click();
    await fixture.whenStable();

    expect(button(tab, 'Drop from tournament')).toBeDefined();
  });

  it('offers a player no Drop for anyone else, nor Reinstate', async () => {
    const { tab } = await openPlaying(carolDropped);

    expect(button(tab, 'Drop from tournament')).toBeDefined();
    expect(button(tab, 'Drop Bob')).toBeUndefined();
    expect(button(tab, 'Reinstate Carol')).toBeUndefined();
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

    expect(playerLines(panel(page))).toContain('Bob · Dropped');
    expect(button(panel(page), 'Reinstate Bob')).toBeDefined();
  });

  it('lets an organizer reinstate a dropped player', async () => {
    const { fixture, page, tab } = await openPlaying(carolDropped, { powers: ORGANIZE_ONLY });
    expect(button(tab, 'Drop Carol')).toBeUndefined();

    button(tab, 'Reinstate Carol')!.click();
    await answerChange(
      fixture,
      `/api/drafts/draft-1/tournament/entries/${carol.id}/drop`,
      'DELETE',
      playing([reported(openMatch('m1', bob.id, carol.id), [0, 2], carol.id)]),
      1,
      threePlayers,
    );

    expect(playerLines(panel(page))).toEqual(['Alice', 'Bob', 'Carol']);
    expect(items(panel(page), 'Tournament round 3')[0]).toContain('Carol vs Alice · Unreported');
  });

  it('offers no Drop or Reinstate once the tournament is complete', async () => {
    const { tab } = await openPlaying(
      { ...carolDropped, state: 'Complete' },
      { powers: ORGANIZE_ONLY },
    );

    expect(playerLines(tab)).toEqual(['Alice', 'Bob', 'Carol · Dropped']);
    expect(button(tab, 'Drop Bob')).toBeUndefined();
    expect(button(tab, 'Reinstate Carol')).toBeUndefined();
    expect(button(tab, 'Drop from tournament')).toBeUndefined();
  });
});
