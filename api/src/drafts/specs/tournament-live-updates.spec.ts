import type { CompleteRoundRequest, DraftView } from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  cancelTournament,
  carol,
  clearGameScore,
  completeDraft,
  completeRound,
  completeTournament,
  confirmMatch,
  dropPlayer,
  getDraft,
  inRegistration,
  joinTournament,
  matchOf,
  playingTournament,
  reinstate,
  removeEntry,
  reopenRound,
  reportCurrentRound,
  reportWin,
  setUpTournament,
  setWin,
  signIn,
  singleElimination,
  startTournament,
  swiss,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
});

/** A playing round robin tournament of Alice and Bob, and its match, reported by Alice as her 2–0 win. */
async function reported() {
  const id = await playingTournament([aliceCookie, bobCookie]);
  await reportWin(id, [alice.id, bob.id], [2, 0], aliceCookie);
  return { id, match: await matchOf(id, alice.id, bob.id) };
}

/**
 * Every tournament write: a draft ready for it, and the write, which
 * expects to succeed (`reportWin` and `setWin` expect a 200 themselves).
 * A new tournament write route gets a row here.
 */
const writes: Record<
  string,
  () => Promise<{ id: string; write: () => Promise<{ body: DraftView }> }>
> = {
  'Tournament setup': async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    return { id, write: () => setUpTournament(id).expect(201) };
  },
  Join: async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await removeEntry(id, bob.id, bobCookie).expect(200);
    return { id, write: () => joinTournament(id, bobCookie).expect(201) };
  },
  'Leave or Remove': async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    return {
      id,
      write: () => removeEntry(id, bob.id, bobCookie).expect(200),
    };
  },
  'Cancel tournament in registration': async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    return { id, write: () => cancelTournament(id).expect(200) };
  },
  'Cancel tournament while playing': async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    return { id, write: () => cancelTournament(id).expect(200) };
  },
  Start: async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    return { id, write: () => startTournament(id).expect(200) };
  },
  Report: async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    return {
      id,
      write: () => reportWin(id, [alice.id, bob.id], [2, 0], bobCookie),
    };
  },
  Confirm: async () => {
    const { id, match } = await reported();
    return {
      id,
      write: () => confirmMatch(id, match.id, bobCookie).expect(200),
    };
  },
  'Correct, or an organizer’s report': async () => {
    const { id } = await reported();
    return { id, write: () => setWin(id, [bob.id, alice.id], [2, 1]) };
  },
  Clear: async () => {
    const { id, match } = await reported();
    return { id, write: () => clearGameScore(id, match.id).expect(200) };
  },
  Drop: async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    return {
      id,
      write: () => dropPlayer(id, bob.id, bobCookie).expect(200),
    };
  },
  Reinstate: async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await dropPlayer(id, bob.id, bobCookie).expect(200);
    return { id, write: () => reinstate(id, bob.id).expect(200) };
  },
  'Complete tournament': async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    return { id, write: () => completeTournament(id).expect(200) };
  },
  'Complete round': async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    await reportWin(id, [alice.id, bob.id], [2, 0], aliceCookie);
    return { id, write: () => completeRound(id).expect(200) };
  },
  'Complete round with a drop in single elimination': async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie],
      singleElimination,
    );
    const { id: matchId } = await matchOf(id, alice.id, bob.id);
    return {
      id,
      write: () =>
        completeRound(id, aliceCookie, {
          drops: [{ matchId, drop: [bob.id] }],
        } satisfies CompleteRoundRequest).expect(200),
    };
  },
  'Reopen round': async () => {
    const carolCookie = await signIn(carol);
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    await reportCurrentRound(id, {
      [alice.id]: aliceCookie,
      [bob.id]: bobCookie,
      [carol.id]: carolCookie,
    });
    await completeRound(id).expect(200);
    return { id, write: () => reopenRound(id).expect(200) };
  },
};

describe('tournament live updates', () => {
  it.each(Object.entries(writes))(
    'bump the draft’s version once with %s',
    async (_, ready) => {
      const { id, write } = await ready();
      const versionNow = async () =>
        (await getDraft(id).expect(200)).body.version as number;
      const before = await versionNow();

      const answer = await write();

      expect(answer.body.version).toBe(before + 1);
      expect(await versionNow()).toBe(before + 1);
    },
  );
});
