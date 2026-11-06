import {
  addBot,
  alice,
  aliceCookie,
  bob,
  carol,
  completeDraft,
  entrants,
  fullDeck,
  getDraft,
  joinTournament,
  pick,
  poolCardIds,
  readyDraft,
  removeEntry,
  setBasic,
  setUpTournament,
  signIn,
  start,
  waitForBotPicks,
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
    expect(await entrants(id)).toEqual([bob.id, alice.id]);

    await removeEntry(id, bob.id, bobCookie).expect(200);
    expect(await entrants(id)).toEqual([alice.id]);
  });

  it('lets a player who left join again', async () => {
    const id = await inRegistration();
    await joinTournament(id, bobCookie).expect(201);
    await removeEntry(id, bob.id, bobCookie).expect(200);

    await joinTournament(id, bobCookie).expect(201);

    expect(await entrants(id)).toEqual([bob.id]);
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
    expect(await entrants(id)).toEqual([]);
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
    expect(await entrants(id)).toEqual([]);
    await setBasic(id, 'Swamp', 19, bobCookie).expect(200);
    await joinTournament(id, bobCookie).expect(201);
  });

  it('never lets a bot join', async () => {
    const carolCookie = await signIn(carol);
    const id = await readyDraft([aliceCookie], 1, [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
    ]);
    const botId = (await addBot(id, carolCookie).expect(201)).body.players[1]
      .id as string;
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await waitForBotPicks(1, async () =>
      expect((await getDraft(id)).body.state).toBe('Complete'),
    );
    await setUpTournament(id).expect(201);
    const botCookie = await signIn({ id: botId, name: 'Bot' });
    await setBasic(id, 'Mountain', 39, botCookie).expect(200);

    expect((await joinTournament(id, botCookie).expect(409)).body.error).toBe(
      'bots-cannot-join',
    );
    expect(await entrants(id)).toEqual([]);
  });
});

describe('removing an entry', () => {
  it('lets an organizer remove a joined player', async () => {
    const id = await inRegistration();
    await joinTournament(id, bobCookie).expect(201);

    await removeEntry(id, bob.id, aliceCookie).expect(200);

    expect(await entrants(id)).toEqual([]);
  });

  it('lets an app admin who is not the organizer remove one', async () => {
    const id = await inRegistration();
    await joinTournament(id, bobCookie).expect(201);

    await removeEntry(id, bob.id, await signIn(carol)).expect(200);

    expect(await entrants(id)).toEqual([]);
  });

  it('refuses a player removing anyone but themselves', async () => {
    const id = await inRegistration();
    await joinTournament(id, aliceCookie).expect(201);

    await removeEntry(id, alice.id, bobCookie).expect(403);

    expect(await entrants(id)).toEqual([alice.id]);
  });

  it('refuses removing someone who hasn’t joined', async () => {
    const id = await inRegistration();

    expect(
      (await removeEntry(id, bob.id, aliceCookie).expect(409)).body.error,
    ).toBe('not-joined');
  });
});
