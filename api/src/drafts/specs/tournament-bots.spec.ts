import type {
  CompleteRoundRequest,
  TournamentRefusal,
  TournamentSetupRequest,
} from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  cancelTournament,
  completeDraftWithBots,
  completeRound,
  completeTournament,
  dropPlayer,
  joinedPlayers,
  fullDeck,
  joinTournament,
  matchOf,
  reinstate,
  removeEntry,
  reportWin,
  setUpTournament,
  setWin,
  signIn,
  singleElimination,
  startTournament,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
});

/** The refusal of taking a bot out of a tournament, by leaving, removal or drop, or reinstating it. */
const BOT_ENTRY: TournamentRefusal = {
  error: 'bot-entry',
  message:
    'A bot stays in its tournament: it can’t leave, be removed, drop or be reinstated.',
};

describe('bots joining at tournament setup', () => {
  it('joins every bot in the draft, whatever its deck holds, and no human', async () => {
    // Each bot's deck holds its one pick, far short of a tournament deck.
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 2);

    await setUpTournament(id).expect(201);

    expect(await joinedPlayers(id)).toEqual(botIds);
  });

  it('joins them again when the tournament is cancelled and set up again', async () => {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 2);
    await setUpTournament(id).expect(201);
    await cancelTournament(id).expect(200);

    await setUpTournament(id).expect(201);

    expect(await joinedPlayers(id)).toEqual(botIds);
  });
});

describe('starting with bots', () => {
  it('starts with one human and one bot', async () => {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 1);
    await setUpTournament(id).expect(201);
    await fullDeck(id, aliceCookie);
    await joinTournament(id, aliceCookie).expect(201);

    await startTournament(id).expect(200);

    const { rounds } = await tournamentView(id);
    expect(rounds.map((round) => round.matches.map((m) => m.players))).toEqual([
      [[botIds[0], alice.id]],
    ]);
  });

  it('starts with two bots alone', async () => {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 2);
    await setUpTournament(id).expect(201);

    await startTournament(id).expect(200);

    const { state, entries } = await tournamentView(id);
    expect(state).toBe('Playing');
    expect(entries.map((entry) => entry.playerId)).toEqual(botIds);
  });
});

describe('what a bot can’t do', () => {
  it('refuses removing a bot during registration, with a reason', async () => {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 2);
    await setUpTournament(id).expect(201);

    const refused = await removeEntry(id, botIds[0], aliceCookie).expect(409);

    expect(refused.body).toEqual(BOT_ENTRY);
    expect(await joinedPlayers(id)).toEqual(botIds);
  });

  it('refuses dropping and reinstating a bot, with a reason', async () => {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 2);
    await setUpTournament(id).expect(201);
    await startTournament(id).expect(200);

    expect(
      (await dropPlayer(id, botIds[0], aliceCookie).expect(409)).body,
    ).toEqual(BOT_ENTRY);
    expect((await reinstate(id, botIds[0]).expect(409)).body).toEqual(
      BOT_ENTRY,
    );
    expect((await tournamentView(id)).entries.map((e) => e.dropped)).toEqual([
      false,
      false,
    ]);
  });

  it('refuses a bot joining, as bots join at setup', async () => {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 1);
    await setUpTournament(id).expect(201);
    const botCookie = await signIn({ id: botIds[0], name: 'Bot' });

    expect((await joinTournament(id, botCookie).expect(409)).body.error).toBe(
      'bots-cannot-join',
    );
  });
});

/**
 * A tournament set up as `setup` on a complete draft of Alice and Bob,
 * both joined, and `bots` bots, which Alice started.
 */
async function playingWithBots(setup: TournamentSetupRequest, bots: number) {
  const { id, botIds } = await completeDraftWithBots(
    [aliceCookie, bobCookie],
    bots,
  );
  await setUpTournament(id, aliceCookie, setup).expect(201);
  for (const cookie of [aliceCookie, bobCookie]) {
    await fullDeck(id, cookie);
    await joinTournament(id, cookie).expect(201);
  }
  await startTournament(id).expect(200);
  return { id, botIds };
}

/** The current tournament round's matches that a bot plays in. */
async function botMatches(id: string, botIds: string[]) {
  const { rounds } = await tournamentView(id);
  return rounds
    .at(-1)!
    .matches.filter((match) => match.players.some((p) => botIds.includes(p)));
}

describe('completing a Swiss tournament round with bots', () => {
  it('refuses to drop a bot from its granted draw, and grants its match a draw', async () => {
    const { id, botIds } = await playingWithBots(swiss(), 2);
    const { rounds } = await tournamentView(id);
    const unreported = rounds[0].matches;
    const withBot = unreported.find((m) =>
      m.players.some((p) => botIds.includes(p)),
    )!;
    const bot = withBot.players.find((p) => botIds.includes(p))!;

    const refused = await completeRound(id, aliceCookie, {
      grantedDraws: unreported.map((match) => ({
        matchId: match.id,
        drop: match === withBot ? [bot] : [],
      })),
    } satisfies CompleteRoundRequest).expect(409);
    expect(refused.body).toEqual(BOT_ENTRY);

    await completeRound(id, aliceCookie, {
      grantedDraws: unreported.map((match) => ({
        matchId: match.id,
        drop: [],
      })),
    } satisfies CompleteRoundRequest).expect(200);
    const after = await tournamentView(id);
    expect(after.rounds[0].matches.map((m) => m.outcome.kind)).toEqual([
      'GrantedDraw',
      'GrantedDraw',
    ]);
    expect(after.entries.every((entry) => !entry.dropped)).toBe(true);
  });
});

describe('completing a single elimination tournament round with bots', () => {
  it('refuses to drop a bot from its match', async () => {
    const { id, botIds } = await playingWithBots(singleElimination, 2);
    const [match] = await botMatches(id, botIds);
    const bot = match.players.find((p) => botIds.includes(p))!;

    const refused = await completeRound(id, aliceCookie, {
      drops: [{ matchId: match.id, drop: [bot] }],
    } satisfies CompleteRoundRequest).expect(409);

    expect(refused.body).toEqual(BOT_ENTRY);
  });

  it.each([
    ['the bot', 0],
    ['its human opponent', 1],
  ])(
    'grants the win of a match between a human and a bot to %s',
    async (_, side) => {
      const { id, botIds } = await completeDraftWithBots([aliceCookie], 1);
      await setUpTournament(id, aliceCookie, singleElimination).expect(201);
      await fullDeck(id, aliceCookie);
      await joinTournament(id, aliceCookie).expect(201);
      await startTournament(id).expect(200);
      const [match] = await botMatches(id, botIds);
      const winner = [botIds[0], alice.id][side];

      await completeRound(id, aliceCookie, {
        grantedWins: [{ matchId: match.id, winner }],
      } satisfies CompleteRoundRequest).expect(200);

      const view = await tournamentView(id);
      expect(view.state).toBe('Complete');
      expect(view.trophyHolders).toEqual([winner]);
    },
  );
});

describe('a bot’s matches', () => {
  it('are reported by its human opponent, unconfirmed, and corrected by an organizer', async () => {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 1);
    await setUpTournament(id).expect(201);
    await fullDeck(id, aliceCookie);
    await joinTournament(id, aliceCookie).expect(201);
    await startTournament(id).expect(200);

    await reportWin(id, [alice.id, botIds[0]], [2, 1], aliceCookie);
    const reported = await matchOf(id, alice.id, botIds[0]);
    expect(reported.reportedBy).toBe(alice.id);
    expect(reported.confirmed).toBe(false);

    await setWin(id, [botIds[0], alice.id], [2, 0]);
    await completeTournament(id).expect(200);
    expect((await tournamentView(id)).trophyHolders).toEqual([botIds[0]]);
  });
});
