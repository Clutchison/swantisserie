import type {
  CompleteRoundRequest,
  DraftSocketEvents,
  DraftView,
  MatchReportRequest,
  TournamentView,
} from 'contract';
import { io, type Socket } from 'socket.io-client';
import {
  alice,
  aliceCookie,
  app,
  bob,
  carol,
  clearGameScore,
  completeDraft,
  completeRound,
  confirmMatch,
  fullDeck,
  getDraft,
  joinTournament,
  placesOf,
  playingTournament,
  reportCurrentRound,
  reportMatch,
  reportWin,
  roundRobin,
  seedsOf,
  setGameScore,
  setUpTournament,
  signIn,
  singleElimination,
  startTournament,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** Players who sign in only where a spec needs more than three. */
const dave = { id: '80351110224678915', name: 'Dave' };
const erin = { id: '80351110224678916', name: 'Erin' };

let bobCookie: string;
let carolCookie: string;
let daveCookie: string;
let erinCookie: string;
/** Each player's cookie by their Discord user id. */
let cookieOf: Record<string, string>;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
  daveCookie = await signIn(dave);
  erinCookie = await signIn(erin);
  cookieOf = {
    [alice.id]: aliceCookie,
    [bob.id]: bobCookie,
    [carol.id]: carolCookie,
    [dave.id]: daveCookie,
    [erin.id]: erinCookie,
  };
});

/** A playing single elimination tournament of the first `count` of Alice, Bob, Carol, Dave and Erin. */
function playing(count: number) {
  const cookies = [aliceCookie, bobCookie, carolCookie, daveCookie, erinCookie];
  return playingTournament(cookies.slice(0, count), singleElimination);
}

describe('starting a single elimination tournament', () => {
  it('seeds the players at random and opens round 1, its byes for the top seeds already advanced', async () => {
    const id = await playing(5);

    const view = await tournamentView(id);
    const seeds = seedsOf(view);
    expect([...seeds].sort()).toEqual(
      [alice.id, bob.id, carol.id, dave.id, erin.id].sort(),
    );
    expect(view.roundCount).toBe(3);
    expect(view.rounds).toHaveLength(1);
    const [round] = view.rounds;
    expect(round.byes).toEqual([seeds[0], seeds[1], seeds[2]]);
    expect(placesOf(round)).toEqual([
      { bracketPlace: 1, players: [seeds[3], seeds[4]] },
    ]);
    expect(round.matches[0].outcome).toEqual({ kind: 'Unreported' });
  });

  it('pairs 4 players seed 1 v 4 and 2 v 3, with no byes', async () => {
    const id = await playing(4);

    const view = await tournamentView(id);
    const seeds = seedsOf(view);
    expect(view.rounds[0].byes).toEqual([]);
    expect(placesOf(view.rounds[0])).toEqual([
      { bracketPlace: 0, players: [seeds[0], seeds[3]] },
      { bracketPlace: 1, players: [seeds[1], seeds[2]] },
    ]);
  });

  it('bumps the draft’s version', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id, aliceCookie, singleElimination).expect(201);
    for (const cookie of [aliceCookie, bobCookie]) {
      await fullDeck(id, cookie);
      await joinTournament(id, cookie).expect(201);
    }
    const before = await getDraft(id).expect(200);

    const answer = await startTournament(id).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
  });
});

describe('the bracket in the tournament read', () => {
  const player = (playerId: string) => ({ kind: 'Player', playerId });

  it('draws every tournament round by bracket place, with the byes and the places still to be decided', async () => {
    const id = await playing(3);

    const view = await tournamentView(id);
    const seeds = seedsOf(view);
    const [match] = view.rounds[0].matches;
    expect(view.bracket).toEqual([
      {
        round: 1,
        places: [
          {
            bracketPlace: 0,
            matchId: null,
            sides: [player(seeds[0]), { kind: 'Bye' }],
            winner: seeds[0],
          },
          {
            bracketPlace: 1,
            matchId: match.id,
            sides: [player(seeds[1]), player(seeds[2])],
            winner: null,
          },
        ],
      },
      {
        round: 2,
        places: [
          {
            bracketPlace: 0,
            matchId: null,
            sides: [
              player(seeds[0]),
              { kind: 'WinnerToCome', bracketPlace: 1 },
            ],
            winner: null,
          },
        ],
      },
    ]);
  });

  it('keeps a player’s unconfirmed report from moving its winner on, until the other player confirms it', async () => {
    const id = await playing(3);
    const seeds = seedsOf(await tournamentView(id));
    await reportWin(id, [seeds[2], seeds[1]], [2, 1], cookieOf[seeds[2]]);

    const reported = await tournamentView(id);
    expect(reported.bracket![0].places[1].winner).toBeNull();
    expect(reported.bracket![1].places[0].sides).toEqual([
      player(seeds[0]),
      { kind: 'WinnerToCome', bracketPlace: 1 },
    ]);

    const [match] = reported.rounds[0].matches;
    await confirmMatch(id, match.id, cookieOf[seeds[1]]).expect(200);
    const confirmed = await tournamentView(id);
    expect(confirmed.bracket![0].places[1].winner).toBe(seeds[2]);
    expect(confirmed.bracket![1].places[0].sides).toEqual([
      player(seeds[0]),
      player(seeds[2]),
    ]);
  });

  it('moves the winner of a game score an organizer entered on at once', async () => {
    const id = await playing(5);
    const view = await tournamentView(id);
    const [match] = view.rounds[0].matches;
    // Alice and Carol (an app admin) both organize; one of them isn't playing this match.
    const organizer = match.players.includes(alice.id)
      ? carolCookie
      : aliceCookie;
    await setGameScore(id, match.id, { games: [2, 0] }, organizer).expect(200);

    const entered = await tournamentView(id);
    expect(entered.bracket![0].places[1].winner).toBe(match.players[0]);
    expect(entered.bracket![1].places[0].sides[1]).toEqual(
      player(match.players[0]),
    );
  });

  it('gives the paired final its match, and its winner once completed', async () => {
    const id = await playing(3);
    const seeds = seedsOf(await tournamentView(id));
    await reportWin(id, [seeds[1], seeds[2]], [2, 0], cookieOf[seeds[1]]);
    await completeRound(id).expect(200);
    await reportWin(id, [seeds[1], seeds[0]], [2, 0], cookieOf[seeds[1]]);
    await completeRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.bracket![1].places).toEqual([
      {
        bracketPlace: 0,
        matchId: view.rounds[1].matches[0].id,
        sides: [player(seeds[0]), player(seeds[1])],
        winner: seeds[1],
      },
    ]);
  });

  it('is left out of other formats and of registration', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], roundRobin);
    const registering = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(registering, aliceCookie, singleElimination).expect(
      201,
    );

    expect((await tournamentView(id)).bracket).toBeNull();
    expect((await tournamentView(registering)).bracket).toBeNull();
  });
});

describe('reporting in single elimination', () => {
  it('refuses a draw, from a player or an organizer', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const draw = { games: [1, 1] } satisfies MatchReportRequest;

    const reported = await reportMatch(id, match.id, bobCookie, draw);
    const corrected = await setGameScore(id, match.id, draw);

    expect([reported.status, corrected.status]).toEqual([409, 409]);
    expect([reported.body.error, corrected.body.error]).toEqual([
      'draw',
      'draw',
    ]);
  });
});

describe('completing a single elimination tournament round', () => {
  it('is refused while a match has no winner', async () => {
    const id = await playing(4);

    const answer = await completeRound(id).expect(409);

    expect(answer.body.error).toBe('unreported-matches');
    expect((await tournamentView(id)).lastCompletedRound).toBe(0);
  });

  it('is for organizers only', async () => {
    const id = await playing(2);
    await reportCurrentRound(id, cookieOf);

    await completeRound(id, bobCookie).expect(403);
  });

  it('gives each listed match the winner picked for it, and pairs the winners into the next round', async () => {
    const id = await playing(5);
    const before = await tournamentView(id);
    const seeds = seedsOf(before);
    const [match] = before.rounds[0].matches;

    await completeRound(id, aliceCookie, {
      grantedWins: [{ matchId: match.id, winner: seeds[4] }],
    } satisfies CompleteRoundRequest).expect(200);

    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds[0].matches[0].outcome).toEqual({
      kind: 'GrantedWin',
      winner: seeds[4],
    });
    expect(view.rounds).toHaveLength(2);
    expect(view.rounds[1].byes).toEqual([]);
    expect(placesOf(view.rounds[1])).toEqual([
      { bracketPlace: 0, players: [seeds[0], seeds[4]] },
      { bracketPlace: 1, players: [seeds[1], seeds[2]] },
    ]);
    // A granted win counts as a won match, with no games.
    expect(view.standings.find((s) => s.playerId === seeds[4])).toMatchObject({
      rank: 1,
      matches: { won: 1, lost: 0, drawn: 0 },
      games: { won: 0, lost: 0, drawn: 0 },
    });
    expect(view.standings.find((s) => s.playerId === seeds[3])?.rank).toBe(5);
  });

  it('rejects granted draws: single elimination never has a draw', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;

    const answer = await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: match.id, drop: [] }],
    } satisfies CompleteRoundRequest).expect(400);

    expect(answer.body.error).toBe('invalid');
    expect((await tournamentView(id)).rounds[0].matches[0].outcome).toEqual({
      kind: 'Unreported',
    });
  });

  it('refuses a granted win in a match reported since', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    await reportCurrentRound(id, cookieOf);

    const answer = await completeRound(id, aliceCookie, {
      grantedWins: [{ matchId: match.id, winner: match.players[1] }],
    } satisfies CompleteRoundRequest).expect(409);

    expect(answer.body.error).toBe('match-reported');
  });

  it('rejects granted wins that aren’t the round’s matches, each won by one of its players', async () => {
    const id = await playing(3);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const bystander = [alice.id, bob.id, carol.id].find(
      (player) => !match.players.includes(player),
    );

    for (const body of [
      { grantedWins: 'all' },
      { grantedWins: [{ matchId: match.id }] },
      { grantedWins: [{ matchId: 'm', winner: match.players[0] }] },
      { grantedWins: [{ matchId: match.id, winner: bystander }] },
    ]) {
      const answer = await completeRound(id, aliceCookie, body).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
  });

  it('completes the tournament with the final, whose winner alone holds the trophy, with no third-place match', async () => {
    const id = await playing(3);
    const seeds = seedsOf(await tournamentView(id));
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    const semifinal = (await tournamentView(id)).rounds[0].matches[0];
    const finalist = semifinal.players[0];

    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.lastCompletedRound).toBe(2);
    expect(view.rounds.map((round) => placesOf(round))).toEqual([
      [{ bracketPlace: 1, players: [seeds[1], seeds[2]] }],
      [{ bracketPlace: 0, players: [seeds[0], finalist] }],
    ]);
    expect(view.trophyHolders).toEqual([seeds[0]]);
    expect(
      view.standings.map(({ playerId, rank }) => [playerId, rank]),
    ).toEqual([
      [seeds[0], 1],
      [finalist, 2],
      [semifinal.players[1], 3],
    ]);
  });
});

describe('single elimination’s live updates', () => {
  const sockets: Socket<DraftSocketEvents>[] = [];

  beforeEach(async () => {
    await app.listen(0);
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  /** The drafts pushed to Bob, viewing draft `draftId`, from once he is connected. */
  async function watchAsBob(draftId: string) {
    const socket: Socket<DraftSocketEvents> = io(await app.getUrl(), {
      path: '/api/socket.io',
      transports: ['websocket'],
      auth: { draftId },
      extraHeaders: { Cookie: bobCookie },
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

  /**
   * Expects `change` to answer the draft of `id` with its version bumped
   * once and its tournament in `state`, and to push that draft to Bob.
   */
  async function expectPushed(
    id: string,
    change: () => Promise<{ body: DraftView }>,
    state: TournamentView['state'],
  ) {
    const pushed = await watchAsBob(id);
    const before = (await getDraft(id).expect(200)).body as DraftView;

    const { body } = await change();

    expect(body.version).toBe(before.version + 1);
    expect(body.tournament).toEqual({ state });
    await vi.waitFor(() =>
      expect(pushed.at(-1)).toMatchObject({
        version: body.version,
        tournament: { state },
      }),
    );
  }

  it('pushes a report', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;

    await expectPushed(
      id,
      () =>
        reportMatch(id, match.id, cookieOf[match.players[0]], {
          games: [2, 0],
        } satisfies MatchReportRequest).expect(200),
      'Playing',
    );
  });

  it('pushes a tournament round completed with a granted win', async () => {
    const id = await playing(3);
    const [match] = (await tournamentView(id)).rounds[0].matches;

    await expectPushed(
      id,
      () =>
        completeRound(id, aliceCookie, {
          grantedWins: [{ matchId: match.id, winner: match.players[1] }],
        } satisfies CompleteRoundRequest).expect(200),
      'Playing',
    );
  });

  it('pushes the final’s completion, which completes the tournament', async () => {
    const id = await playing(2);
    await reportCurrentRound(id, cookieOf);

    await expectPushed(id, () => completeRound(id).expect(200), 'Complete');
  });
});

describe('clearing in single elimination', () => {
  it('clears a match of the open tournament round back to unreported', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    await reportCurrentRound(id, cookieOf);

    await clearGameScore(id, match.id).expect(200);

    expect((await tournamentView(id)).rounds[0].matches[0].outcome).toEqual({
      kind: 'Unreported',
    });
  });
});
