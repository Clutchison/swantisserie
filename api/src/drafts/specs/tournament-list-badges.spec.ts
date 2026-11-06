import type { DraftListItemView, TournamentBadgeView } from 'contract';
import {
  aliceCookie,
  bob,
  carol,
  completeDraft,
  completeRound,
  completeTournament,
  dropPlayer,
  fullDeck,
  joinTournament,
  listDrafts,
  playingTournament,
  reportWin,
  setUpTournament,
  signIn,
  singleElimination,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

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

/** A badge in `state` that doesn't offer the viewer Join, naming `trophyHolders`. */
function withoutJoin(
  state: TournamentBadgeView['state'],
  trophyHolders: string[] = [],
): TournamentBadgeView {
  return { state, canJoin: false, trophyHolders };
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

// Which viewers may join is the tournament read's to show
// (tournament-registration.spec.ts); the badge reads it the same way, per viewer.
it('offers Join in registration to each viewer whom joining would let in, as the tournament read does', async () => {
  const id = await inRegistration();

  expect(await badgeOf(id, bobCookie)).toEqual({
    state: 'Registration',
    canJoin: true,
    trophyHolders: [],
  });
  await joinTournament(id, bobCookie).expect(201);
  expect(await badgeOf(id, bobCookie)).toEqual(withoutJoin('Registration'));
  // Alice, who hasn't, still may.
  expect((await badgeOf(id, aliceCookie))?.canJoin).toBe(true);
});

it('shows a playing tournament, which nobody may join', async () => {
  const id = await playingTournament([bobCookie, carolCookie]);

  for (const cookie of [aliceCookie, bobCookie]) {
    expect(await badgeOf(id, cookie)).toEqual(withoutJoin('Playing'));
  }
});

describe('once complete', () => {
  it('names the trophy holder', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    await completeTournament(id).expect(200);

    expect(await badgeOf(id)).toEqual(withoutJoin('Complete', [bob.id]));
  });

  it('says only that it is complete when nobody holds the trophy, as when both finalists dropped', async () => {
    const id = await playingTournament(
      [bobCookie, carolCookie],
      singleElimination,
    );
    await dropPlayer(id, bob.id, aliceCookie).expect(200);
    await dropPlayer(id, carol.id, aliceCookie).expect(200);
    await completeRound(id).expect(200);

    expect(await badgeOf(id)).toEqual(withoutJoin('Complete'));
  });

  it('names every trophy holder who shares first', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await completeTournament(id).expect(200);

    expect(await badgeOf(id)).toEqual(
      withoutJoin('Complete', [bob.id, carol.id]),
    );
  });
});
