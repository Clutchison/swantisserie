import {
  alice,
  aliceCookie,
  bob,
  carol,
  completeDraft,
  joinedPlayers,
  fullDeck,
  inRegistration,
  joinTournament,
  removeEntry,
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

describe('leaving and joining again', () => {
  it('lets a joined player leave and join again, listed in join order', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    await removeEntry(id, alice.id, aliceCookie).expect(200);
    expect(await joinedPlayers(id)).toEqual([bob.id]);

    await joinTournament(id, aliceCookie).expect(201);
    expect(await joinedPlayers(id)).toEqual([bob.id, alice.id]);
  });

  it('lets a player join again whatever their mainboard holds', async () => {
    // Bob's deck holds just his one pick.
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);
    await removeEntry(id, bob.id, bobCookie).expect(200);

    await joinTournament(id, bobCookie).expect(201);

    expect(await joinedPlayers(id)).toEqual([alice.id, bob.id]);
  });

  it('refuses a player who has already joined, and one leaving who hasn’t', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    expect((await joinTournament(id, bobCookie).expect(409)).body.error).toBe(
      'already-joined',
    );
    await removeEntry(id, bob.id, bobCookie).expect(200);
    expect(
      (await removeEntry(id, bob.id, bobCookie).expect(409)).body.error,
    ).toBe('not-joined');
  });

  it('refuses someone who isn’t one of the draft’s players, an organizer included', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    const carolCookie = await signIn(carol);

    expect((await joinTournament(id, carolCookie).expect(403)).body.error).toBe(
      'not-a-player',
    );
    expect(await joinedPlayers(id)).toEqual([alice.id, bob.id]);
  });

  it('answers no-tournament before setup', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await fullDeck(id, bobCookie);

    expect((await joinTournament(id, bobCookie).expect(404)).body.error).toBe(
      'no-tournament',
    );
  });
});

describe('what the tournament read tells the viewer of joining', () => {
  /** Whether the tournament read lets the viewer with `cookie` join, and why not. */
  async function joining(id: string, cookie: string) {
    const { canJoin, joinRefusal } = (await tournament(id, cookie).expect(200))
      .body as { canJoin: unknown; joinRefusal: unknown };
    return { canJoin, joinRefusal };
  }

  it('offers Join to a player who has left, whatever their deck holds, and not while they are in', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);

    expect(await joining(id, bobCookie)).toMatchObject({
      canJoin: false,
      joinRefusal: { error: 'already-joined' },
    });
    await removeEntry(id, bob.id, bobCookie).expect(200);
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

  it('offers nothing to someone who isn’t one of the draft’s players, nor once the tournament has started', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    const carolCookie = await signIn(carol);

    expect(await joining(id, carolCookie)).toEqual({
      canJoin: false,
      joinRefusal: null,
    });
    await startTournament(id).expect(200);
    expect(await joining(id, bobCookie)).toEqual({
      canJoin: false,
      joinRefusal: null,
    });
  });
});

describe('removing an entry', () => {
  it('lets an organizer remove a joined player', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    await removeEntry(id, bob.id, aliceCookie).expect(200);

    expect(await joinedPlayers(id)).toEqual([alice.id]);
  });

  it('lets an app admin who is not the organizer remove one', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    await removeEntry(id, bob.id, await signIn(carol)).expect(200);

    expect(await joinedPlayers(id)).toEqual([alice.id]);
  });

  it('refuses a player removing anyone but themselves', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    await removeEntry(id, alice.id, bobCookie).expect(403);

    expect(await joinedPlayers(id)).toEqual([alice.id, bob.id]);
  });

  it('refuses removing someone who isn’t in the tournament', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await removeEntry(id, bob.id, bobCookie).expect(200);

    expect(
      (await removeEntry(id, bob.id, aliceCookie).expect(409)).body.error,
    ).toBe('not-joined');
  });
});
