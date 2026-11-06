import {
  alice,
  aliceCookie,
  bob,
  carol,
  clearResult,
  completeTournament,
  confirmMatch,
  getDraft,
  matchOf,
  playingTournament,
  reportWin,
  setResult,
  setWin,
  signIn,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A player who signs in only where a spec needs one who isn't Alice. */
const dave = { id: '80351110224678915', name: 'Dave' };

let bobCookie: string;
let carolCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
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

  it('refuses a draw, a game score a best-of-three match never ends at, and a body that isn’t a game score', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    const match = await matchOf(id, bob.id, carol.id);

    const draw = await setResult(id, match.id, { games: [1, 1] }).expect(409);
    expect(draw.body.error).toBe('draw');
    const tooMany = await setResult(id, match.id, { games: [0, 3] }).expect(
      409,
    );
    expect(tooMany.body.error).toBe('not-best-of-three');
    const invalid = await setResult(id, match.id, { games: [2] }).expect(400);
    expect(invalid.body.error).toBe('invalid');
    expect((await matchOf(id, bob.id, carol.id)).outcome.kind).toBe(
      'Unreported',
    );
  });

  it('answers 404 for a match the tournament doesn’t have', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);

    const set = await setResult(id, 'no-such-match', {
      games: [2, 0],
    }).expect(404);
    expect(set.body.error).toBe('no-match');
    const clear = await clearResult(id, 'no-such-match').expect(404);
    expect(clear.body.error).toBe('no-match');
  });
});

describe('correcting and clearing a result', () => {
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

    await clearResult(id, match.id).expect(200);

    const cleared = await matchOf(id, bob.id, carol.id);
    expect(cleared.outcome).toEqual({ kind: 'Unreported' });
    expect(cleared.reportedBy).toBeNull();
    expect(
      (await tournamentView(id)).standings.map(({ rank }) => rank),
    ).toEqual([1, 1]);
    await reportWin(id, [carol.id, bob.id], [2, 1], carolCookie);
  });

  it('removes the confirmation of a confirmed match it corrects or clears', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    const match = await matchOf(id, bob.id, carol.id);
    await confirmMatch(id, match.id, carolCookie).expect(200);

    await setWin(id, [bob.id, carol.id], [2, 1]);

    expect((await matchOf(id, bob.id, carol.id)).confirmed).toBe(false);
    await confirmMatch(id, match.id, carolCookie).expect(200);

    await clearResult(id, match.id).expect(200);

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
    const daveCookie = await signIn(dave);

    // Carol is an app admin, so she may.
    for (const cookie of [bobCookie, daveCookie]) {
      await setResult(id, match.id, { games: [0, 2] }, cookie).expect(403);
      await clearResult(id, match.id, cookie).expect(403);
    }
    expect(await gamesOf(id, [bob.id, carol.id])).toEqual([2, 0]);
  });
});

describe('corrections after completion', () => {
  it('move the trophy', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    await completeTournament(id).expect(200);
    expect((await tournamentView(id)).trophyHolders).toEqual([bob.id]);

    await setWin(id, [carol.id, bob.id], [2, 0]);

    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.trophyHolders).toEqual([carol.id]);
  });

  it('turn a cleared match into a granted draw, as completing does', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 0], bobCookie);
    await completeTournament(id).expect(200);
    const match = await matchOf(id, bob.id, carol.id);

    await clearResult(id, match.id).expect(200);

    expect((await matchOf(id, bob.id, carol.id)).outcome).toEqual({
      kind: 'GrantedDraw',
    });
    expect((await tournamentView(id)).trophyHolders).toEqual([
      bob.id,
      carol.id,
    ]);
  });

  it('let an organizer give a granted draw a game score', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    await completeTournament(id).expect(200);

    await setWin(id, [bob.id, carol.id], [2, 1]);

    expect((await tournamentView(id)).trophyHolders).toEqual([bob.id]);
  });
});

describe('live updates', () => {
  it('bump the draft’s version with each report, correction and clear', async () => {
    const id = await playingTournament([bobCookie, carolCookie]);
    const match = await matchOf(id, bob.id, carol.id);
    const versionNow = async () =>
      (await getDraft(id).expect(200)).body.version as number;

    const changes = [
      () => setResult(id, match.id, { games: [2, 0] }).expect(200),
      () => setResult(id, match.id, { games: [1, 2] }).expect(200),
      () => clearResult(id, match.id).expect(200),
    ];
    for (const change of changes) {
      const before = await versionNow();
      const answer = await change();
      expect(answer.body.version).toBe(before + 1);
    }
  });
});
