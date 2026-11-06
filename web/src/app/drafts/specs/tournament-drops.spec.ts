import { answer, question } from '../../specs-harness';
import { ORGANIZE_ONLY, alice, bob, button, http, panel, text, useDraftsApp } from './harness';
import {
  answerChange,
  carol,
  dave,
  forfeited,
  gridCell,
  gridCellName,
  openMatch,
  openPlaying,
  playerLines,
  playing,
  reported,
  threePlayers,
  withDrops,
  yourMatches,
} from './play-tab-harness';

useDraftsApp();

/** Carol dropped, after beating Bob: her match against Alice (m3) is a forfeit. */
const carolDropped = withDrops(
  [carol.id],
  [
    reported(openMatch('m1', bob.id, carol.id), [0, 2], carol.id),
    forfeited(openMatch('m3', carol.id, alice.id), carol.id),
  ],
);

describe('drops on the Play tab', () => {
  it('shows dropped players and their forfeits', async () => {
    const { tab } = await openPlaying(carolDropped, { user: dave });

    expect(playerLines(tab)).toEqual(['Alice', 'Bob', 'Carol · Dropped']);
    expect(text(gridCell(tab, 'Carol', 'Alice'))).toBe('F');
    expect(text(gridCell(tab, 'Alice', 'Carol'))).toBe('W');
  });

  it('lets a player drop from the tournament once they go ahead', async () => {
    const { fixture, page, tab } = await openPlaying(playing());

    button(tab, 'Drop from tournament')!.click();
    const dialog = await question('Drop from the tournament?');
    expect(dialog.textContent).toContain(
      'Your unplayed matches become forfeits, and only an organizer can reinstate you. Your deck stays locked until the tournament is complete or cancelled.',
    );
    await answer(dialog, 'Drop');
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
    expect(yourMatches(panel(page))).toEqual([
      'Forfeit: you dropped against Bob',
      'Forfeit: you dropped against Carol',
    ]);
    expect(button(panel(page), 'Report your match against Bob')).toBeUndefined();
  });

  it('sends nothing when the player thinks better of dropping', async () => {
    const { fixture, tab } = await openPlaying(playing());

    button(tab, 'Drop from tournament')!.click();
    await answer(await question('Drop from the tournament?'), 'Cancel');
    await fixture.whenStable();

    http.expectNone(`/api/drafts/draft-1/tournament/entries/${alice.id}/drop`);

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

  it('lets an organizer drop a player once they go ahead', async () => {
    const { fixture, page, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Drop Bob')!.click();
    const dialog = await question('Drop Bob from the tournament?');
    expect(dialog.textContent).toContain('Their unplayed matches become forfeits.');
    await answer(dialog, 'Drop');
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

  it('keeps a player the organizer thinks better of dropping', async () => {
    const { fixture, tab } = await openPlaying(playing(), { powers: ORGANIZE_ONLY });

    button(tab, 'Drop Bob')!.click();
    await answer(await question('Drop Bob from the tournament?'), 'Cancel');
    await fixture.whenStable();

    http.expectNone(`/api/drafts/draft-1/tournament/entries/${bob.id}/drop`);
    expect(button(tab, 'Drop Bob')).toBeDefined();
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
    expect(gridCellName(panel(page), 'Alice', 'Carol')).toBe('Alice against Carol: unreported');
    expect(yourMatches(panel(page))).toContain('vs Carol');
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
