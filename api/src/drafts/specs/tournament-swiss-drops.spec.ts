import type { CompleteRoundRequest, TournamentView } from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  carol,
  clearGameScore,
  completeRound,
  dropPlayer,
  getDraft,
  matchOf,
  playingTournament,
  reinstate,
  reportLatestRound,
  reportWin,
  setWin,
  signIn,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A fourth player, who signs in only where a spec needs four. */
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

/** Every player seated in the tournament round: in a match or with its bye. */
function seated(round: TournamentView['rounds'][number]) {
  return [
    ...round.matches.flatMap((match) => match.players),
    ...(round.bye ? [round.bye] : []),
  ];
}

/** The ids of the tournament's dropped players. */
function droppedIn(view: TournamentView) {
  return view.entries
    .filter((entry) => entry.dropped)
    .map((entry) => entry.playerId);
}

describe('completing a Swiss round with unreported matches', () => {
  it('settles each as a granted draw and drops the players chosen for it', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [first, second] = (await tournamentView(id)).rounds[0].matches;
    const gone = first.players[0];

    await completeRound(id, aliceCookie, {
      grantedDraws: [
        { matchId: first.id, drop: [gone] },
        { matchId: second.id, drop: [] },
      ],
    } satisfies CompleteRoundRequest).expect(200);

    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds[0].matches.map((match) => match.outcome)).toEqual([
      { kind: 'GrantedDraw' },
      { kind: 'GrantedDraw' },
    ]);
    expect(droppedIn(view)).toEqual([gone]);
    expect(view.standings.find((s) => s.playerId === gone)).toMatchObject({
      matchPoints: 1,
      matches: { won: 0, lost: 0, drawn: 1 },
    });
    // The three players left in are paired, one of them with the bye.
    expect(view.rounds).toHaveLength(2);
    expect(seated(view.rounds[1]).sort()).toEqual(
      [alice.id, bob.id, carol.id, dave.id].filter((p) => p !== gone).sort(),
    );
  });

  it('is refused while an unreported match is left unsettled', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [first] = (await tournamentView(id)).rounds[0].matches;

    const answer = await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: first.id, drop: first.players }],
    } satisfies CompleteRoundRequest).expect(409);

    expect(answer.body.error).toBe('unreported-matches');
    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(0);
    expect(view.rounds[0].matches.map((match) => match.outcome.kind)).toEqual([
      'Unreported',
      'Unreported',
    ]);
    expect(droppedIn(view)).toEqual([]);
  });

  it('ignores drop choices in the final tournament round, which completes the tournament', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    const [match] = (await tournamentView(id)).rounds[0].matches;

    await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: match.id, drop: match.players }],
    } satisfies CompleteRoundRequest).expect(200);

    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.rounds[0].matches[0].outcome).toEqual({ kind: 'GrantedDraw' });
    expect(droppedIn(view)).toEqual([]);
    // Both share first on one granted draw each.
    expect(view.trophyHolders.sort()).toEqual([alice.id, bob.id].sort());
  });

  it('rejects granted draws that aren’t match ids with lists of players', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());

    for (const body of [
      { grantedDraws: 'all' },
      { grantedDraws: [{ matchId: 'm' }] },
      { grantedDraws: [{ matchId: 'm', drop: [1] }] },
    ]) {
      const answer = await completeRound(id, aliceCookie, body).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
  });

  it('completes the tournament when fewer than 2 players are left in', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    const [round] = (await tournamentView(id)).rounds;
    const [match] = round.matches;

    await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: match.id, drop: match.players }],
    } satisfies CompleteRoundRequest).expect(200);

    const view = await tournamentView(id);
    expect(view.roundCount).toBe(2);
    expect(view.state).toBe('Complete');
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds).toHaveLength(1);
    expect(view.trophyHolders).toEqual([round.bye]);
  });

  it('bumps the draft’s version once', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const matches = (await tournamentView(id)).rounds[0].matches;
    const before = await getDraft(id).expect(200);

    const answer = await completeRound(id, aliceCookie, {
      grantedDraws: matches.map((match) => ({
        matchId: match.id,
        drop: [match.players[1]],
      })),
    } satisfies CompleteRoundRequest).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
  });
});

describe('dropping from a Swiss tournament', () => {
  it('forfeits the current unplayed match, and leaves the player out of the next round', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [played, unplayed] = (await tournamentView(id)).rounds[0].matches;
    await reportWin(id, played.players, [2, 0], cookieOf[played.players[1]]);
    const gone = unplayed.players[0];

    await dropPlayer(id, gone, cookieOf[gone]).expect(200);

    expect((await matchOf(id, ...unplayed.players)).outcome).toEqual({
      kind: 'Forfeit',
      forfeitedBy: gone,
    });
    await completeRound(id).expect(200);
    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome.kind).toBe('GameScore');
    expect(seated(view.rounds[1])).toHaveLength(3);
    expect(seated(view.rounds[1])).not.toContain(gone);
  });
});

describe('correcting a Swiss tournament', () => {
  it('keeps the next round’s pairings and changes only the standings', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);
    const before = await tournamentView(id);
    const [winner, loser] = before.rounds[0].matches[0].players;

    await setWin(id, [loser, winner], [2, 1]);

    const after = await tournamentView(id);
    expect(after.rounds[1]).toEqual(before.rounds[1]);
    expect(after.lastCompletedRound).toBe(1);
    expect(after.standings.find((s) => s.playerId === loser)).toMatchObject({
      matchPoints: 3,
    });
    expect(after.standings.find((s) => s.playerId === winner)).toMatchObject({
      matchPoints: 0,
    });
  });

  it('makes a cleared match of a completed round a granted draw, the round staying completed', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);
    const [match] = (await tournamentView(id)).rounds[0].matches;

    await clearGameScore(id, match.id).expect(200);

    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome).toEqual({ kind: 'GrantedDraw' });
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds).toHaveLength(2);
  });
});

describe('reinstating a player in a Swiss tournament', () => {
  it('turns their forfeits back into unreported matches before the next round is paired', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const gone = match.players[1];
    await dropPlayer(id, gone, cookieOf[gone]).expect(200);

    await reinstate(id, gone).expect(200);

    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome).toEqual({ kind: 'Unreported' });
    expect(droppedIn(view)).toEqual([]);
  });

  it('is refused once a later round has been paired after their drop', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const gone = match.players[1];
    await dropPlayer(id, gone, cookieOf[gone]).expect(200);
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);

    const answer = await reinstate(id, gone).expect(409);

    expect(answer.body.error).toBe('paired-since-drop');
    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome).toEqual({
      kind: 'Forfeit',
      forfeitedBy: gone,
    });
    expect(droppedIn(view)).toEqual([gone]);
  });

  it('is refused for a player dropped as their round was completed, once the next is paired', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const matches = (await tournamentView(id)).rounds[0].matches;
    const gone = matches[0].players[0];
    await completeRound(id, aliceCookie, {
      grantedDraws: matches.map((match, i) => ({
        matchId: match.id,
        drop: i === 0 ? [gone] : [],
      })),
    } satisfies CompleteRoundRequest).expect(200);

    const answer = await reinstate(id, gone).expect(409);

    expect(answer.body.error).toBe('paired-since-drop');
    expect(droppedIn(await tournamentView(id))).toEqual([gone]);
  });
});
