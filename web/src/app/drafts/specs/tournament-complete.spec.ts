import { alice, bob, button, useDraftsApp } from './harness';
import {
  bobBeatAlice,
  completed,
  grantedDraw,
  openPlaying,
  playing,
  unreportedMatch,
  yourMatches,
} from './play-tab-harness';

useDraftsApp();

describe('Play tab once the tournament is complete', () => {
  it('shows a match left unreported as the granted draw completing made it', async () => {
    const { tab } = await openPlaying(
      completed(playing([grantedDraw(unreportedMatch('m2', alice.id, bob.id))])),
    );

    expect(yourMatches(tab)).toContain('vs Bob · Granted draw');
  });

  it('offers no Confirm once the tournament is complete, as its results are final', async () => {
    const { tab } = await openPlaying(
      completed(playing([bobBeatAlice], { trophyHolders: [bob.id] })),
    );

    expect(yourMatches(tab)).toContain('vs Bob · Lost 1–2');
    expect(button(tab, 'Confirm your match against Bob')).toBeUndefined();
  });
});
