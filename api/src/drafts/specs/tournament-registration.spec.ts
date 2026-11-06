import {
  alice,
  aliceCookie,
  bob,
  carol,
  completeDraft,
  joinedPlayers,
  fullDeck,
  joinTournament,
  removeEntry,
  setBasic,
  setUpTournament,
  signIn,
  startTournament,
  tournament,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
});

/** A complete draft of Alice and Bob, both with full decks, and its tournament in registration. */
async function inRegistration() {
  const id = await completeDraft([aliceCookie, bobCookie]);
  await fullDeck(id, aliceCookie);
  await fullDeck(id, bobCookie);
  await setUpTournament(id).expect(201);
  return id;
}

describe('joining and leaving', () => {
  it('lets the draft’s players join, listed in join order, and leave', async () => {
    const id = await inRegistration();

    await joinTournament(id, bobCookie).expect(201);
    await joinTournament(id, aliceCookie).expect(201);
    expect(await joinedPlayers(id)).toEqual([bob.id, alice.id]);

    await removeEntry(id, bob.id, bobCookie).expect(200);
    expect(await joinedPlayers(id)).toEqual([alice.id]);
  });

  it('lets a player who left join again', async () => {
    const id = await inRegistration();
    await joinTournament(id, bobCookie).expect(201);
    await removeEntry(id, bob.id, bobCookie).expect(200);

    await joinTournament(id, bobCookie).expect(201);

    expect(await joinedPlayers(id)).toEqual([bob.id]);
  });

  it('refuses a player who has already joined, and one leaving who hasn’t', async () => {
    const id = await inRegistration();
    await joinTournament(id, bobCookie).expect(201);

    expect((await joinTournament(id, bobCookie).expect(409)).body.error).toBe(
      'already-joined',
    );
    expect(
      (await removeEntry(id, alice.id, aliceCookie).expect(409)).body.error,
    ).toBe('not-joined');
  });

  it('refuses someone who isn’t one of the draft’s players, an organizer included', async () => {
    const id = await inRegistration();
    const carolCookie = await signIn(carol);

    expect((await joinTournament(id, carolCookie).expect(403)).body.error).toBe(
      'not-a-player',
    );
    expect(await joinedPlayers(id)).toEqual([]);
  });

  it('answers no-tournament before setup', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await fullDeck(id, bobCookie);

    expect((await joinTournament(id, bobCookie).expect(404)).body.error).toBe(
      'no-tournament',
    );
  });

  it('refuses a deck whose mainboard holds fewer than 40 cards, picks and basic lands counted, saying why', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);
    // One pick and 38 basics: 39.
    await setBasic(id, 'Mountain', 20, bobCookie).expect(200);
    await setBasic(id, 'Swamp', 18, bobCookie).expect(200);

    const refused = await joinTournament(id, bobCookie).expect(409);

    expect(refused.body).toEqual({
      error: 'deck-too-small',
      message:
        'Your mainboard holds 39 cards. A tournament deck needs at least 40.',
    });
    expect(await joinedPlayers(id)).toEqual([]);
    await setBasic(id, 'Swamp', 19, bobCookie).expect(200);
    await joinTournament(id, bobCookie).expect(201);
  });
});

describe('what the tournament read tells the viewer of joining', () => {
  /** Whether the tournament read lets the viewer with `cookie` join, and why not. */
  async function joining(id: string, cookie: string) {
    const { canJoin, joinRefusal } = (await tournament(id, cookie).expect(200))
      .body as { canJoin: unknown; joinRefusal: unknown };
    return { canJoin, joinRefusal };
  }

  it('offers Join to a player whom joining would let in, and not once they have joined', async () => {
    const id = await inRegistration();

    expect(await joining(id, bobCookie)).toEqual({
      canJoin: true,
      joinRefusal: null,
    });
    await joinTournament(id, bobCookie).expect(201);
    expect(await joining(id, bobCookie)).toMatchObject({
      canJoin: false,
      joinRefusal: { error: 'already-joined' },
    });
  });

  it('says why a player whose deck is too small can’t join, as joining would', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);
    // One pick and 38 basics: 39.
    await setBasic(id, 'Mountain', 20, bobCookie).expect(200);
    await setBasic(id, 'Swamp', 18, bobCookie).expect(200);

    expect(await joining(id, bobCookie)).toEqual({
      canJoin: false,
      joinRefusal: {
        error: 'deck-too-small',
        message:
          'Your mainboard holds 39 cards. A tournament deck needs at least 40.',
      },
    });
    await setBasic(id, 'Swamp', 19, bobCookie).expect(200);
    expect(await joining(id, bobCookie)).toEqual({
      canJoin: true,
      joinRefusal: null,
    });
  });

  it('offers nothing to someone who isn’t one of the draft’s players, nor once the tournament has started', async () => {
    const id = await inRegistration();
    await joinTournament(id, aliceCookie).expect(201);
    const carolCookie = await signIn(carol);

    expect(await joining(id, carolCookie)).toEqual({
      canJoin: false,
      joinRefusal: null,
    });
    await joinTournament(id, bobCookie).expect(201);
    await startTournament(id).expect(200);
    expect(await joining(id, bobCookie)).toEqual({
      canJoin: false,
      joinRefusal: null,
    });
  });
});

describe('removing an entry', () => {
  it('lets an organizer remove a joined player', async () => {
    const id = await inRegistration();
    await joinTournament(id, bobCookie).expect(201);

    await removeEntry(id, bob.id, aliceCookie).expect(200);

    expect(await joinedPlayers(id)).toEqual([]);
  });

  it('lets an app admin who is not the organizer remove one', async () => {
    const id = await inRegistration();
    await joinTournament(id, bobCookie).expect(201);

    await removeEntry(id, bob.id, await signIn(carol)).expect(200);

    expect(await joinedPlayers(id)).toEqual([]);
  });

  it('refuses a player removing anyone but themselves', async () => {
    const id = await inRegistration();
    await joinTournament(id, aliceCookie).expect(201);

    await removeEntry(id, alice.id, bobCookie).expect(403);

    expect(await joinedPlayers(id)).toEqual([alice.id]);
  });

  it('refuses removing someone who hasn’t joined', async () => {
    const id = await inRegistration();

    expect(
      (await removeEntry(id, bob.id, aliceCookie).expect(409)).body.error,
    ).toBe('not-joined');
  });
});
