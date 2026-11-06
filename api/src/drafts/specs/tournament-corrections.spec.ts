import type { TournamentSetupRequest } from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  carol,
  clearGameScore,
  completeRound,
  completeTournament,
  confirmMatch,
  dropPlayer,
  matchOf,
  playingTournament,
  playTournamentRound,
  reportCurrentRound,
  reopenRound,
  reportWin,
  setGameScore,
  setWin,
  signIn,
  singleElimination,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A player who signs in only where a spec needs one who isn't Alice. */
const dave = { id: '80351110224678915', name: 'Dave' };

let bobCookie: string;
let carolCookie: string;
let daveCookie: string;
/** Each player's cookie by their Discord user id. */
let cookieOf: Record<string, string>;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
  daveCookie = await signIn(dave);
  cookieOf = {
    [alice.id]: aliceCookie,
    [bob.id]: bobCookie,
    [carol.id]: carolCookie,
    [dave.id]: daveCookie,
  };
});

/** The match between `winner` and `loser` read as `winner`'s games won and `loser`'s. */
async function gamesOf(id: string, [winner, loser]: [string, string]) {
  const match = await matchOf(id, winner, loser);
  if (match.outcome.kind !== 'GameScore') return match.outcome.kind;
  const [first, second] = match.outcome.games;
  return match.players[0] === winner ? [first, second] : [second, first];
}

describe('organizer reports', () => {
  it('lets an organizer who isn’t playing report a match for its players', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);

    await setWin(id, [carol.id, bob.id], [2, 1]);

    expect(await gamesOf(id, [carol.id, bob.id])).toEqual([2, 1]);
    const match = await matchOf(id, bob.id, carol.id);
    expect(match.reportedBy).toBe(alice.id);
    expect(match.confirmed).toBe(false);
    expect((await tournamentView(id)).standings[0].playerId).toBe(carol.id);
  });

  it('refuses a game score a match can’t end at, saying why, and a body that isn’t a game score', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    const match = await matchOf(id, bob.id, carol.id);

    const draw = await setGameScore(id, match.id, { games: [1, 1] }).expect(
      409,
    );
    expect(draw.body.error).toBe('draw');
    const tooMany = await setGameScore(id, match.id, { games: [0, 3] }).expect(
      409,
    );
    expect(tooMany.body.error).toBe('not-best-of-three');
    const invalid = await setGameScore(id, match.id, { games: [2] }).expect(
      400,
    );
    expect(invalid.body.error).toBe('invalid');
    expect((await matchOf(id, bob.id, carol.id)).outcome.kind).toBe(
      'Unreported',
    );
  });

  it('answers 404 for a match the tournament doesn’t have', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);

    const set = await setGameScore(id, 'no-such-match', {
      games: [2, 0],
    }).expect(404);
    expect(set.body.error).toBe('no-match');
    const clear = await clearGameScore(id, 'no-such-match').expect(404);
    expect(clear.body.error).toBe('no-match');
  });
});

describe('correcting and clearing a game score', () => {
  it('lets an organizer correct a reported match, which changes the standings', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);

    await setWin(id, [carol.id, bob.id], [2, 1]);

    expect(await gamesOf(id, [carol.id, bob.id])).toEqual([2, 1]);
    expect((await matchOf(id, bob.id, carol.id)).reportedBy).toBe(alice.id);
    const { standings } = await tournamentView(id);
    expect(standings.map(({ playerId, rank }) => [playerId, rank])).toEqual([
      [carol.id, 1],
      [bob.id, 2],
    ]);
  });

  it('lets an organizer clear a reported match, which is unreported again', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    const match = await matchOf(id, bob.id, carol.id);

    await clearGameScore(id, match.id).expect(200);

    const cleared = await matchOf(id, bob.id, carol.id);
    expect(cleared.outcome).toEqual({ kind: 'Unreported' });
    expect(cleared.reportedBy).toBeNull();
    expect(
      (await tournamentView(id)).standings.map(({ rank }) => rank),
    ).toEqual([1, 1]);
    await reportWin(id, [carol.id, bob.id], [2, 1], carolCookie);
  });

  it('restores the forfeit by a dropped player when clearing their match, so it can’t be played', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await dropPlayer(id, carol.id, carolCookie).expect(200);
    await setWin(id, [alice.id, carol.id], [2, 1]);
    const match = await matchOf(id, alice.id, carol.id);

    await clearGameScore(id, match.id).expect(200);

    const cleared = await matchOf(id, alice.id, carol.id);
    expect(cleared.outcome).toEqual({ kind: 'Forfeit', forfeitedBy: carol.id });
    expect(cleared.reportedBy).toBeNull();
    await reportWin(id, [alice.id, carol.id], [2, 0], aliceCookie, 409);
  });

  it('removes the confirmation of a confirmed match it corrects or clears', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    const match = await matchOf(id, bob.id, carol.id);
    await confirmMatch(id, match.id, carolCookie).expect(200);

    await setWin(id, [bob.id, carol.id], [2, 1]);

    expect((await matchOf(id, bob.id, carol.id)).confirmed).toBe(false);
    await confirmMatch(id, match.id, carolCookie).expect(200);

    await clearGameScore(id, match.id).expect(200);

    expect((await matchOf(id, bob.id, carol.id)).confirmed).toBe(false);
  });

  it('lets an organizer who plays correct their own match', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(id, [bob.id, alice.id], [2, 0], bobCookie);

    await setWin(id, [alice.id, bob.id], [2, 1]);

    expect(await gamesOf(id, [alice.id, bob.id])).toEqual([2, 1]);
  });

  it('refuses anyone without the power to organize the draft, the match’s players included', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    const match = await matchOf(id, bob.id, carol.id);

    // Carol is an app admin, so she may.
    for (const cookie of [bobCookie, daveCookie]) {
      await setGameScore(id, match.id, { games: [0, 2] }, cookie).expect(403);
      await clearGameScore(id, match.id, cookie).expect(403);
    }
    expect(await gamesOf(id, [bob.id, carol.id])).toEqual([2, 0]);
  });
});

describe('completed results', () => {
  it('are final once a round robin tournament is complete', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    await completeTournament(id).expect(200);
    const match = await matchOf(id, bob.id, carol.id);

    const corrected = await setGameScore(id, match.id, { games: [0, 2] });
    const cleared = await clearGameScore(id, match.id);

    for (const answer of [corrected, cleared]) {
      expect(answer.status).toBe(409);
      expect(answer.body).toMatchObject({
        error: 'tournament-complete',
        message: expect.stringContaining('final'),
      });
    }
    expect(await gamesOf(id, [bob.id, carol.id])).toEqual([2, 0]);
    expect((await tournamentView(id)).trophyHolders).toEqual([bob.id]);
  });

  it('are final once a Swiss tournament round is completed, saying it can be reopened', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    const [first, second] = (await tournamentView(id)).rounds;

    const corrected = await setGameScore(id, first.matches[0].id, {
      games: [0, 2],
    });
    const cleared = await clearGameScore(id, first.matches[0].id);

    for (const answer of [corrected, cleared]) {
      expect(answer.status).toBe(409);
      expect(answer.body).toMatchObject({
        error: 'round-completed',
        message: expect.stringContaining('Reopen'),
      });
    }
    expect((await tournamentView(id)).rounds[0]).toEqual(first);
    await setGameScore(id, second.matches[0].id, { games: [2, 1] }).expect(200);
    await clearGameScore(id, second.matches[0].id).expect(200);
  });

  it('are final in a single elimination tournament round once it is completed', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      singleElimination,
    );
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    const [first] = (await tournamentView(id)).rounds;

    await setGameScore(id, first.matches[0].id, { games: [0, 2] }).expect(409);
    await clearGameScore(id, first.matches[0].id).expect(409);

    expect((await tournamentView(id)).rounds[0]).toEqual(first);
  });

  it('never become a granted draw when cleared in an open tournament round', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [match] = (await tournamentView(id)).rounds[0].matches;
    await setGameScore(id, match.id, { games: [2, 0] }).expect(200);

    await clearGameScore(id, match.id).expect(200);

    expect((await matchOf(id, ...match.players)).outcome).toEqual({
      kind: 'Unreported',
    });
  });
});

describe('which tournament rounds the read says are correctable', () => {
  /** Whether each tournament round reads correctable, in order. */
  async function correctable(id: string) {
    return (await tournamentView(id)).rounds.map((round) => round.correctable);
  }

  /**
   * Corrects and then clears the first match of each tournament round,
   * expecting both allowed where the round reads correctable and both
   * refused where it doesn't.
   */
  async function expectRefusalsFollowTheRead(id: string) {
    for (const round of (await tournamentView(id)).rounds) {
      const status = round.correctable ? 200 : 409;
      const [match] = round.matches;
      await setGameScore(id, match.id, { games: [2, 1] }).expect(status);
      await clearGameScore(id, match.id).expect(status);
    }
  }

  it('reads a completed Swiss tournament round not correctable until it is reopened, and the next one correctable', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    expect(await correctable(id)).toEqual([true]);

    await playTournamentRound(id, cookieOf);

    expect(await correctable(id)).toEqual([false, true]);
    await expectRefusalsFollowTheRead(id);

    await reopenRound(id).expect(200);

    expect(await correctable(id)).toEqual([true]);
    await expectRefusalsFollowTheRead(id);
  });

  it('reads round robin’s round correctable while the tournament is playing', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);

    expect(await correctable(id)).toEqual([true]);
    await expectRefusalsFollowTheRead(id);
  });

  it.each<[string, TournamentSetupRequest]>([
    ['Swiss', swiss()],
    ['single elimination', singleElimination],
  ])(
    'reads every round of a complete %s tournament not correctable',
    async (_, setup) => {
      const id = await playingTournament(
        [aliceCookie, bobCookie, carolCookie, daveCookie],
        setup,
      );
      while ((await tournamentView(id)).state === 'Playing') {
        await playTournamentRound(id, cookieOf);
      }

      const flags = await correctable(id);
      expect(flags.length).toBeGreaterThan(1);
      expect(flags).toEqual(flags.map(() => false));
      await expectRefusalsFollowTheRead(id);
    },
  );

  it('reads a complete round robin tournament’s round not correctable', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await completeTournament(id).expect(200);

    expect(await correctable(id)).toEqual([false]);
    await expectRefusalsFollowTheRead(id);
  });
});
