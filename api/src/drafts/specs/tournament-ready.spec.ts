import type {
  DraftSocketEvents,
  DraftView,
  ViewerTournamentView,
} from 'contract';
import { io, type Socket } from 'socket.io-client';
import {
  alice,
  aliceCookie,
  app,
  announcementsSettled,
  bob,
  cancelTournament,
  carol,
  changeWebhook,
  clearBasics,
  completeDraft,
  completeDraftWithBots,
  fullDeck,
  getDraft,
  inRegistration,
  joinTournament,
  markReady,
  movePlanned,
  poolCardIds,
  registerWebhook,
  removeEntry,
  setBasic,
  setUpTournament,
  signIn,
  startTournament,
  tournament,
  unmarkReady,
  useDraftsApp,
  webhookClient,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
});

/** The draft's tournament as whoever `cookie` signs in reads it. */
async function viewOf(id: string, cookie = aliceCookie) {
  return (await tournament(id, cookie).expect(200))
    .body as ViewerTournamentView;
}

/** Whether each joined player is ready, by their Discord user id, as `cookie`'s user reads it. */
async function readyByPlayer(id: string, cookie = aliceCookie) {
  return Object.fromEntries(
    (await viewOf(id, cookie)).entries.map((entry) => [
      entry.playerId,
      entry.ready,
    ]),
  );
}

/** The refusal's code of marking ready that `cookie`'s user sends, expecting a 409. */
async function refusedMark(id: string, cookie: string) {
  return (await markReady(id, cookie).expect(409)).body.error as string;
}

/** The refusal's code of unmarking ready that `cookie`'s user sends, expecting a 409. */
async function refusedUnmark(id: string, cookie: string) {
  return (await unmarkReady(id, cookie).expect(409)).body.error as string;
}

describe('marking yourself ready', () => {
  it('lets a joined player mark themselves ready and unmark it, kept on their entry', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    await markReady(id, bobCookie).expect(200);
    expect(await readyByPlayer(id)).toEqual({
      [alice.id]: false,
      [bob.id]: true,
    });

    await unmarkReady(id, bobCookie).expect(200);
    expect(await readyByPlayer(id)).toEqual({
      [alice.id]: false,
      [bob.id]: false,
    });
  });

  it('answers with the draft, its version bumped, so another viewer re-reads it and sees the change', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    const before = (await getDraft(id).expect(200)).body.version as number;

    const answer = await markReady(id, bobCookie).expect(200);

    expect(answer.body.version).toBe(before + 1);
    expect(await readyByPlayer(id, aliceCookie)).toEqual({
      [alice.id]: false,
      [bob.id]: true,
    });
  });

  it('marks only the caller’s own entry: an organizer marking changes only their own', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    await markReady(id, aliceCookie).expect(200);
    await markReady(id, bobCookie).expect(200);
    await unmarkReady(id, aliceCookie).expect(200);

    expect(await readyByPlayer(id)).toEqual({
      [alice.id]: false,
      [bob.id]: true,
    });
  });

  it('leaves marking ready, or unmarking it, as it is when sent twice', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    await markReady(id, bobCookie).expect(200);
    await markReady(id, bobCookie).expect(200);
    expect((await readyByPlayer(id))[bob.id]).toBe(true);

    await unmarkReady(id, bobCookie).expect(200);
    await unmarkReady(id, bobCookie).expect(200);
    expect((await readyByPlayer(id))[bob.id]).toBe(false);
  });

  it('starts a player who leaves, or is removed, and joins again as not ready', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await markReady(id, bobCookie).expect(200);
    await removeEntry(id, bob.id, bobCookie).expect(200);
    await joinTournament(id, bobCookie).expect(201);
    expect((await readyByPlayer(id))[bob.id]).toBe(false);

    await markReady(id, bobCookie).expect(200);
    await removeEntry(id, bob.id, aliceCookie).expect(200);
    await joinTournament(id, bobCookie).expect(201);
    expect((await readyByPlayer(id))[bob.id]).toBe(false);
  });

  it('lets the tournament start with nobody ready', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    await startTournament(id).expect(200);
  });

  it('posts no announcement', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await changeWebhook(id, await registerWebhook()).expect(200);
    for (const cookie of [aliceCookie, bobCookie]) await fullDeck(id, cookie);
    await setUpTournament(id).expect(201);
    await announcementsSettled(id);
    webhookClient.post.mockClear();

    await markReady(id, bobCookie).expect(200);
    await unmarkReady(id, bobCookie).expect(200);

    await announcementsSettled(id);
    expect(webhookClient.post).not.toHaveBeenCalled();
  });
});

describe('ready refusals', () => {
  it('refuses marking ready while the player’s mainboard holds fewer than 40 cards, and lets it once it holds 40', async () => {
    // Bob's deck holds his one pick and 38 Mountains.
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);
    await setBasic(id, 'Mountain', 38, bobCookie).expect(200);

    expect((await markReady(id, bobCookie).expect(409)).body).toEqual({
      error: 'deck-too-small-for-ready',
      message:
        'Your mainboard holds 39 cards. Fill your deck to at least 40 before marking yourself ready.',
    });
    expect((await readyByPlayer(id))[bob.id]).toBe(false);

    await fullDeck(id, bobCookie);
    await markReady(id, bobCookie).expect(200);
  });

  it('refuses marking and unmarking ready outside registration', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await startTournament(id).expect(200);

    expect(await refusedMark(id, bobCookie)).toBe('not-in-registration');
    expect(await refusedUnmark(id, bobCookie)).toBe('not-in-registration');
  });

  it('refuses a player who hasn’t joined, and someone who isn’t one of the draft’s players', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await removeEntry(id, bob.id, bobCookie).expect(200);
    const carolCookie = await signIn(carol);

    expect(await refusedMark(id, bobCookie)).toBe('not-joined');
    expect(await refusedUnmark(id, bobCookie)).toBe('not-joined');
    expect(await refusedMark(id, carolCookie)).toBe('not-joined');
  });

  it('refuses a bot marking itself ready', async () => {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 1);
    await setUpTournament(id).expect(201);
    const botCookie = await signIn({ id: botIds[0], name: 'Bot' });

    expect(await refusedMark(id, botCookie)).toBe('bots-never-ready');
  });

  it('answers no-tournament before setup', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    expect((await markReady(id, bobCookie).expect(404)).body.error).toBe(
      'no-tournament',
    );
  });
});

describe('what the tournament read tells of ready', () => {
  it('counts the ready players of the joined humans, leaving bots out of both numbers', async () => {
    const { id } = await completeDraftWithBots([aliceCookie, bobCookie], 2);
    await fullDeck(id, bobCookie);
    await setUpTournament(id).expect(201);

    await markReady(id, bobCookie).expect(200);

    const view = await viewOf(id);
    expect(view.readyCount).toEqual({ ready: 1, of: 2 });
    expect(view.entries.filter((entry) => entry.ready)).toHaveLength(1);
  });

  it('lets a joined player toggle ready once their mainboard holds 40 cards', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);
    expect((await viewOf(id, bobCookie)).canToggleReady).toBe(false);

    await fullDeck(id, bobCookie);

    expect((await viewOf(id, bobCookie)).canToggleReady).toBe(true);
  });

  it('lets nobody toggle ready who hasn’t joined, isn’t a player, or once the tournament has started', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await removeEntry(id, bob.id, bobCookie).expect(200);
    const carolCookie = await signIn(carol);

    expect((await viewOf(id, bobCookie)).canToggleReady).toBe(false);
    expect((await viewOf(id, carolCookie)).canToggleReady).toBe(false);
    expect((await viewOf(id, aliceCookie)).canToggleReady).toBe(true);

    await joinTournament(id, bobCookie).expect(201);
    await startTournament(id).expect(200);
    expect((await viewOf(id, aliceCookie)).canToggleReady).toBe(false);
  });

  it('forgets every entry’s ready when the tournament is cancelled and set up again', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await markReady(id, bobCookie).expect(200);
    await cancelTournament(id).expect(200);

    await setUpTournament(id).expect(201);

    expect((await viewOf(id)).readyCount).toEqual({ ready: 0, of: 2 });
  });
});

describe('ready clearing when the mainboard drops below 40 cards', () => {
  /** A tournament in registration with Bob ready, his mainboard exactly 40 cards: Lightning Bolt and 39 Mountains. */
  async function bobReady() {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await markReady(id, bobCookie).expect(200);
    return id;
  }

  /** The draft's version as Alice reads it. */
  async function version(id: string) {
    return (await getDraft(id).expect(200)).body.version as number;
  }

  it('clears ready when a card moves from the mainboard to the sideboard, bumping the version so others see it', async () => {
    const id = await bobReady();
    const bolt = (await poolCardIds(id))['Lightning Bolt'];
    const before = await version(id);

    await movePlanned(id, bolt, 'Sideboard', bobCookie).expect(200);

    expect(await version(id)).toBe(before + 1);
    const view = await viewOf(id, aliceCookie);
    expect(view.entries.find((entry) => entry.playerId === bob.id)?.ready).toBe(
      false,
    );
    expect(view.readyCount).toEqual({ ready: 0, of: 2 });
  });

  describe('pushed to another viewer', () => {
    const sockets: Socket<DraftSocketEvents>[] = [];

    beforeEach(async () => {
      await app.listen(0);
    });

    afterEach(() => {
      for (const socket of sockets.splice(0)) socket.disconnect();
    });

    /** The drafts pushed to Alice, viewing draft `id`, from once she is connected. */
    async function watchAsAlice(id: string) {
      const socket: Socket<DraftSocketEvents> = io(await app.getUrl(), {
        path: '/api/socket.io',
        transports: ['websocket'],
        auth: { draftId: id },
        extraHeaders: { Cookie: aliceCookie },
        reconnection: false,
      });
      sockets.push(socket);
      const pushed: DraftView[] = [];
      socket.on('changed', (draft) => pushed.push(draft));
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
      });
      return pushed;
    }

    it('pushes the draft, its version bumped, to another viewer when ready clears', async () => {
      const id = await bobReady();
      const pushed = await watchAsAlice(id);
      const before = await version(id);

      await setBasic(id, 'Mountain', 38, bobCookie).expect(200);

      await vi.waitFor(() =>
        expect(pushed.map((draft) => draft.version)).toEqual([before + 1]),
      );
    });
  });

  it('clears ready when a basic land count takes the mainboard below 40, and when basics are cleared', async () => {
    const id = await bobReady();

    await setBasic(id, 'Mountain', 38, bobCookie).expect(200);
    expect((await readyByPlayer(id))[bob.id]).toBe(false);

    await fullDeck(id, bobCookie);
    await markReady(id, bobCookie).expect(200);
    await clearBasics(id, bobCookie).expect(200);
    expect((await readyByPlayer(id))[bob.id]).toBe(false);
  });

  it('leaves ready, and the draft’s version, alone when the mainboard stays at 40 or more', async () => {
    const id = await bobReady();
    await setBasic(id, 'Island', 2, bobCookie).expect(200);
    const before = await version(id);

    await setBasic(id, 'Mountain', 37, bobCookie).expect(200);
    await setBasic(id, 'Island', 3, bobCookie).expect(200);

    expect((await readyByPlayer(id))[bob.id]).toBe(true);
    expect(await version(id)).toBe(before);
  });

  it('leaves the draft’s version alone when a player who isn’t ready shrinks their mainboard', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    const before = await version(id);

    await clearBasics(id, bobCookie).expect(200);

    expect(await version(id)).toBe(before);
  });

  it('lets the player mark themselves ready again once their mainboard is back to 40', async () => {
    const id = await bobReady();
    await setBasic(id, 'Mountain', 38, bobCookie).expect(200);
    expect(await refusedMark(id, bobCookie)).toBe('deck-too-small-for-ready');

    await fullDeck(id, bobCookie);

    await markReady(id, bobCookie).expect(200);
    expect((await readyByPlayer(id))[bob.id]).toBe(true);
  });
});
