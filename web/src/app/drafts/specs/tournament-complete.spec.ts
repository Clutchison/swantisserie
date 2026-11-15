import { alice, bob, button, namedList, text, useDraftsApp } from './harness';
import {
  answerChange,
  bobBeatAlice,
  completed,
  completedSwiss,
  confirmedMatch,
  failChange,
  grantedDraw,
  gridCell,
  openPlaying,
  playing,
  threePlayers,
  unreportedMatch,
  yourMatches,
} from './play-tab-harness';
import { expectByResults } from './play-tab-placement-harness';

useDraftsApp();

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
      true,
    );

    expect(yourMatches(tab)).toContain('vs Bob · Lost 1–2 · Confirmed');
    expect(text(gridCell(tab, 'Bob', 'Alice'))).toBe('2–1');
  });

  it('says confirming from the list of matches failed by that list, before the players', async () => {
    const { fixture, page, tab } = await openPlaying(completedSwiss);

    button(namedList(tab, 'Tournament round 2'), 'Confirm your match against Carol')!.click();

    expect(
      await failChange(fixture, page, '/api/drafts/draft-1/tournament/matches/m2/confirm'),
    ).toBe("Couldn't confirm the match. Try again in a moment.");
    expectByResults(page, tab);
  });
});
