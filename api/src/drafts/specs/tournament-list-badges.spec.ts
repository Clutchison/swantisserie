import type { DraftListItemView, TournamentBadgeView } from 'contract';
import {
  aliceCookie,
  bob,
  carol,
  completeDraft,
  completeTournament,
  fullDeck,
  joinTournament,
  listDrafts,
  playingTournament,
  reportWin,
  setUpTournament,
  setWin,
  signIn,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A user who signs in only where a spec needs one who isn't one of the draft's players. */
const dave = { id: '80351110224678915', name: 'Dave' };

let bobCookie: string;
let carolCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
});

/** The tournament badge the draft list shows the signed-in viewer for the draft. */
async function badgeOf(
  id: string,
  cookie = aliceCookie,
): Promise<TournamentBadgeView | null> {
  const { body } = await listDrafts(cookie).expect(200);
  const draft = (body as DraftListItemView[]).find((each) => each.id === id);
  return draft!.tournamentBadge;
}

/** A complete draft of Alice and Bob, both with full decks, and its tournament in registration. */
async function inRegistration() {
  const id = await completeDraft([aliceCookie, bobCookie]);
  await fullDeck(id, aliceCookie);
  await fullDeck(id, bobCookie);
  await setUpTournament(id).expect(201);
  return id;
}

it('is null for a draft without a tournament', async () => {
  const id = await completeDraft([aliceCookie, bobCookie]);

  expect(await badgeOf(id)).toBeNull();
});

describe('in registration', () => {
  it('lets a player who hasn’t joined, with a full deck, join', async () => {
    const id = await inRegistration();

    expect(await badgeOf(id, bobCookie)).toEqual({
      state: 'Registration',
      canJoin: true,
      trophyHolders: [],
    });
  });

  it('doesn’t offer Join to a player who has joined', async () => {
    const id = await inRegistration();
    await joinTournament(id, bobCookie).expect(201);

    expect(await badgeOf(id, bobCookie)).toEqual({
      state: 'Registration',
      canJoin: false,
      trophyHolders: [],
    });
    // Alice, who hasn't, still may.
    expect((await badgeOf(id, aliceCookie))?.canJoin).toBe(true);
  });

  it('doesn’t offer Join to anyone who isn’t one of the draft’s players', async () => {
    const id = await inRegistration();
    const daveCookie = await signIn(dave);

    // Carol is an app admin, Dave just a guild member.
    for (const cookie of [carolCookie, daveCookie]) {
      expect(await badgeOf(id, cookie)).toEqual({
        state: 'Registration',
        canJoin: false,
        trophyHolders: [],
      });
    }
  });

  it('doesn’t offer Join to a player whose mainboard is too small to join', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);

    expect((await badgeOf(id, bobCookie))?.canJoin).toBe(false);
    await joinTournament(id, bobCookie).expect(409);
  });
});

it('shows a playing tournament, which nobody may join', async () => {
  const id = await playingTournament([bobCookie, carolCookie]);

  for (const cookie of [aliceCookie, bobCookie]) {
    expect(await badgeOf(id, cookie)).toEqual({
      state: 'Playing',
      canJoin: false,
      trophyHolders: [],
    });
  }
});

describe('once complete', () => {
  it('names the trophy holder', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    await completeTournament(id).expect(200);

    expect(await badgeOf(id)).toEqual({
      state: 'Complete',
      canJoin: false,
      trophyHolders: [bob.id],
    });
  });

  it('names every trophy holder who shares first', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await completeTournament(id).expect(200);

    expect((await badgeOf(id))?.trophyHolders).toEqual([bob.id, carol.id]);
  });

  it('moves the trophy after a correction', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    await completeTournament(id).expect(200);

    await setWin(id, [carol.id, bob.id], [2, 0]);

    expect(await badgeOf(id)).toEqual({
      state: 'Complete',
      canJoin: false,
      trophyHolders: [carol.id],
    });
  });
});
