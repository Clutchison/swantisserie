import {
  ranked,
  standingOf,
  type DecidedMatch,
  type MatchOutcome,
  type Standing,
  type TournamentMatch,
} from './tournament.js';

/**
 * How many tournament rounds a single elimination tournament of `joined`
 * players plays: ⌈log₂ joined⌉, the rounds of a bracket sized to the next
 * power of two.
 */
export function singleEliminationRoundCount(joined: number): number {
  return Math.max(1, Math.ceil(Math.log2(joined)));
}

/**
 * One match of a single elimination bracket at its bracket place: its place
 * in its tournament round, from 0. Bracket place p of a round is fed by the
 * players who advance from places 2p and 2p + 1 of the round before. A null
 * second player makes it a bye: the top seeds' in round 1, and in a later
 * round the player whose would-be opponent nobody sent on.
 */
export interface BracketMatch {
  bracketPlace: number;
  players: readonly [string, string | null];
}

/**
 * Tournament round 1 of the bracket for `seedOrder`, seed 1 first, in bracket place
 * order. The bracket is sized to the next power of two, and the shortfall
 * is byes for the top seeds. Seeds meet in the standard seed layout (1 v 8,
 * 4 v 5, 2 v 7, 3 v 6, generalised), which keeps the top two seeds apart
 * until the final.
 */
export function firstBracketRound(
  seedOrder: readonly string[],
): BracketMatch[] {
  const size = 2 ** singleEliminationRoundCount(seedOrder.length);
  const layout = seedLayout(size);
  const player = (seed: number) => seedOrder[seed - 1] ?? null;
  return Array.from({ length: size / 2 }, (_, bracketPlace) => ({
    bracketPlace,
    players: [
      player(layout[2 * bracketPlace])!,
      player(layout[2 * bracketPlace + 1]),
    ],
  }));
}

/**
 * The next tournament round of a bracket from `advancing`, the player each
 * bracket place of the round before sends on, in bracket place order, or
 * null where nobody advances: the players advancing from neighbouring
 * bracket places meet. A player whose would-be opponent is null has a bye,
 * and a bracket place nobody reaches is left out.
 */
export function nextBracketRound(
  advancing: readonly (string | null)[],
): BracketMatch[] {
  return Array.from({ length: advancing.length / 2 }, (_, bracketPlace) => {
    const [first = null, second = null] = [
      advancing[2 * bracketPlace],
      advancing[2 * bracketPlace + 1],
    ].filter((id) => id !== null);
    return first === null
      ? null
      : { bracketPlace, players: [first, second] as const };
  }).filter((match) => match !== null);
}

/**
 * The players paired in the tournament round after a match's, in a match
 * or a bye; none while it isn't paired yet. Once it is, who advanced from
 * the match is settled, and a later drop doesn't change it.
 */
interface PairedOnward {
  nextRoundPlayers?: readonly string[];
}

/**
 * A match of a bracket, or a bye when its second player is null, as the
 * players who advance are read from it; a null outcome is unreported, and
 * a bye has none.
 */
export interface BracketResult extends PairedOnward {
  players: readonly [string, string | null];
  outcome: MatchOutcome | null;
}

/** A single elimination match as its standings read it. */
export interface SingleEliminationMatch extends TournamentMatch, PairedOnward {}

/**
 * A bracket match as its players reported it, or a bye: who reported its
 * game score, and whether the other player confirmed it.
 */
export interface ReportedBracketResult extends BracketResult {
  reportedBy: string | null;
  confirmed: boolean;
}

/**
 * Who a bracket place sends on to the next tournament round: a player, or
 * nobody, once its result is agreed; until then, not agreed.
 */
export type Advancing =
  | { kind: 'Player'; playerId: string }
  | { kind: 'Nobody' }
  | { kind: 'NotAgreed' };

/**
 * Who a bracket match, or a bye, sends on to the next tournament round,
 * `dropped` holding every player who has dropped, and `roundCompleted`
 * whether its tournament round is (or the tournament is) completed. The
 * player with a bye advances at once, unless they dropped. A match's winner
 * advances once its result is agreed: once its round is completed, and
 * before that when it is a granted win, a forfeit, a game score the other
 * player confirmed, or one someone not playing in it, an organizer,
 * entered; a player's unconfirmed report isn't agreed yet, nor is an
 * unreported match. Nobody advances from a forfeit whose players both
 * dropped before the next tournament round was paired with either of them,
 * so whoever would have met its winner has a bye. A played match's winner
 * advances even if both its players dropped since.
 */
export function agreedAdvancingPlayer(
  {
    players,
    outcome,
    reportedBy,
    confirmed,
    nextRoundPlayers,
  }: ReportedBracketResult,
  dropped: readonly string[],
  roundCompleted: boolean,
): Advancing {
  const [first, second] = players;
  if (second === null) {
    return dropped.includes(first)
      ? { kind: 'Nobody' }
      : { kind: 'Player', playerId: first };
  }
  if (outcome === null) return { kind: 'NotAgreed' };
  const match: DecidedMatch = { players: [first, second], outcome };
  if (nobodyWins(match, dropped, nextRoundPlayers)) return { kind: 'Nobody' };
  const agreed =
    roundCompleted ||
    outcome.kind !== 'GameScore' ||
    confirmed ||
    reportedBy === null ||
    !players.includes(reportedBy);
  if (!agreed) return { kind: 'NotAgreed' };
  const winner = winnerOf(match);
  return winner === null
    ? { kind: 'Nobody' }
    : { kind: 'Player', playerId: winner };
}

/**
 * How many players `results`, a completed tournament round's matches and
 * byes, send on to the next, `dropped` holding every player who has
 * dropped, as agreedAdvancingPlayer decides it: Complete round completes
 * the tournament when fewer than MIN_PLAYERS_LEFT are.
 */
export function countAdvancing(
  results: readonly BracketResult[],
  dropped: readonly string[],
): number {
  return results.filter(
    (result) =>
      agreedAdvancingPlayer(
        { ...result, reportedBy: null, confirmed: false },
        dropped,
        true,
      ).kind === 'Player',
  ).length;
}

/**
 * Whether `match` is a forfeit that both its players dropped from, which
 * nobody wins: unless either of them is in `nextRoundPlayers`, the players
 * paired in the tournament round after it, as its winner is once they
 * advanced.
 */
function nobodyWins(
  match: DecidedMatch,
  dropped: readonly string[],
  nextRoundPlayers: readonly string[] = [],
) {
  return (
    match.outcome.kind === 'Forfeit' &&
    match.players.every(
      (id) => dropped.includes(id) && !nextRoundPlayers.includes(id),
    )
  );
}

/**
 * A match's tournament round and its bracket place in it. The contract's
 * RoundAndBracketPlace is the same type.
 */
export interface RoundAndBracketPlace {
  round: number;
  bracketPlace: number;
}

/**
 * The later matches of a bracket of `roundCount` tournament rounds that
 * depend on the match at `round` and `bracketPlace`, round by round up to
 * the final: each is fed by the one before, so a change of who advances
 * from it changes who plays them.
 */
export function dependentBracketPlaces(
  { round, bracketPlace }: RoundAndBracketPlace,
  roundCount: number,
): RoundAndBracketPlace[] {
  return Array.from({ length: roundCount - round }, (_, i) => ({
    round: round + i + 1,
    bracketPlace: bracketPlace >> (i + 1),
  }));
}

/**
 * Who a side of a bracket place is: a player, a bye, or, until the result
 * of the bracket place of the tournament round before that feeds it is
 * agreed, the winner to come of that place.
 */
export type BracketSide =
  | { kind: 'Player'; playerId: string }
  | { kind: 'Bye' }
  | { kind: 'WinnerToCome'; bracketPlace: number };

/**
 * One bracket place of a tournament round: its two sides, and the player
 * who advances from it once that is agreed.
 */
export interface BracketPlace {
  bracketPlace: number;
  sides: [BracketSide, BracketSide];
  /**
   * The player it sends on, as agreedAdvancingPlayer decides: the winner
   * of its match once its result is agreed, or the player with its bye
   * unless they dropped. Null until then, and when nobody advances from it.
   */
  advancing: string | null;
}

/** One tournament round of a bracket, its bracket places in order. */
export interface BracketRound {
  round: number;
  places: BracketPlace[];
}

/** A match or bye of a bracket paired so far, at its tournament round and bracket place, with who it sends on. */
export interface PlayedBracketMatch extends BracketMatch {
  round: number;
  /** As agreedAdvancingPlayer decides it. */
  advancing: Advancing;
}

/**
 * Every tournament round of a bracket of `roundCount` rounds, from the
 * matches and byes paired so far, `played`, `dropped` holding every player
 * who has dropped. A bracket place not yet paired has a side for each
 * place of the round before feeding it: the player who advances from that
 * place once that is agreed, else its winner to come; or a bye when nobody
 * advances from it, the other side first. A place not yet paired sends on
 * the player with such a bye at once, unless they dropped, and nobody when
 * both its sides are byes.
 */
export function bracketRounds(
  roundCount: number,
  played: readonly PlayedBracketMatch[],
  dropped: readonly string[],
): BracketRound[] {
  const rounds: BracketRound[] = [];
  let previous: Advancing[] = [];
  for (let round = 1; round <= roundCount; round++) {
    const fedBy = (bracketPlace: number): BracketSide => {
      const advancing = previous[bracketPlace];
      if (advancing?.kind === 'Player') return advancing;
      if (advancing?.kind === 'Nobody') return { kind: 'Bye' };
      return { kind: 'WinnerToCome', bracketPlace };
    };
    const places = Array.from(
      { length: 2 ** (roundCount - round) },
      (_, bracketPlace): [BracketPlace['sides'], Advancing] => {
        const match = played.find(
          (m) => m.round === round && m.bracketPlace === bracketPlace,
        );
        if (match) {
          const [first, second] = match.players;
          const sides: BracketPlace['sides'] = [
            { kind: 'Player', playerId: first },
            second === null
              ? { kind: 'Bye' }
              : { kind: 'Player', playerId: second },
          ];
          return [sides, match.advancing];
        }
        const fed = [fedBy(2 * bracketPlace), fedBy(2 * bracketPlace + 1)];
        const [first, second] =
          fed[0].kind === 'Bye' ? [fed[1], fed[0]] : [fed[0], fed[1]];
        return [[first, second], unpairedAdvancing(first, second, dropped)];
      },
    );
    rounds.push({
      round,
      places: places.map(([sides, advancing], bracketPlace) => ({
        bracketPlace,
        sides,
        advancing: advancing.kind === 'Player' ? advancing.playerId : null,
      })),
    });
    previous = places.map(([, advancing]) => advancing);
  }
  return rounds;
}

/**
 * Who a bracket place not yet paired, its sides `first` and `second`, sends
 * on: the player with its bye, as for a paired bye; nobody from two byes;
 * otherwise not agreed until it is paired and played.
 */
function unpairedAdvancing(
  first: BracketSide,
  second: BracketSide,
  dropped: readonly string[],
): Advancing {
  if (second.kind !== 'Bye') return { kind: 'NotAgreed' };
  if (first.kind === 'Bye') return { kind: 'Nobody' };
  if (first.kind === 'WinnerToCome') return { kind: 'NotAgreed' };
  return agreedAdvancingPlayer(
    {
      players: [first.playerId, null],
      outcome: null,
      reportedBy: null,
      confirmed: false,
    },
    dropped,
    false,
  );
}

/**
 * The byes of each tournament round of `rounds`, with the players paired
 * in the tournament round after it.
 */
export interface RoundByes {
  byes: readonly string[];
  nextRoundPlayers: readonly string[];
}

/**
 * The players with the byes of `rounds` that sent them on, for
 * singleEliminationStandings: every bye but that of a player who dropped
 * before the tournament round after it was paired with them, from which
 * nobody advances; `dropped` holds every player who has.
 */
export function byesSendingOn(
  rounds: readonly RoundByes[],
  dropped: readonly string[],
): string[] {
  return rounds.flatMap(({ byes, nextRoundPlayers }) =>
    byes.filter((id) => !dropped.includes(id) || nextRoundPlayers.includes(id)),
  );
}

/**
 * The standings of a single elimination tournament's `players`, in seed
 * order, after `matches`, with `byes` holding the player with each bye: by
 * the tournament round each reached, as counted by the matches they won,
 * byes included, so the winner of the final ranks first alone. Players out
 * in the same tournament round, or still in it, share a rank and keep seed
 * order, the rank after a shared one skipping, as in 1, 1, 3. Unreported
 * matches count for nothing, and so does a forfeit whose players both
 * dropped before the next tournament round was paired with either of them,
 * `dropped` holding every player who has. Such a forfeit still puts both
 * its players out, so when every player in the furthest tournament round
 * reached is out in it, as when both finalists drop, nobody ranks first
 * and they share second. The trophy holders are therefore always
 * trophyHolders of the final standings.
 */
export function singleEliminationStandings(
  players: readonly string[],
  matches: readonly SingleEliminationMatch[],
  byes: readonly string[],
  dropped: readonly string[] = [],
): Standing[] {
  const decided = matches.filter(
    (match): match is DecidedMatch =>
      match.outcome !== null &&
      !nobodyWins(
        { players: match.players, outcome: match.outcome },
        dropped,
        match.nextRoundPlayers,
      ),
  );
  const table = players.map((playerId) =>
    standingOf(playerId, decided, byes.filter((id) => id === playerId).length),
  );
  const standings = ranked(table, (a, b) => b.matches.won - a.matches.won);
  const out = new Set(
    matches.flatMap(({ players: pair, outcome, nextRoundPlayers }) => {
      if (outcome === null) return [];
      const match: DecidedMatch = { players: pair, outcome };
      if (nobodyWins(match, dropped, nextRoundPlayers)) return pair;
      return pair.filter((id) => id !== winnerOf(match));
    }),
  );
  const first = standings.filter((standing) => standing.rank === 1);
  if (first.every((standing) => out.has(standing.playerId))) {
    first.forEach((standing) => (standing.rank = 2));
  }
  return standings;
}

/**
 * The winner of a decided single elimination match: the player with more
 * games, the opponent of the player who forfeited, or the granted win's.
 * Null for a draw, which single elimination never accepts.
 */
export function winnerOf({ players, outcome }: DecidedMatch): string | null {
  switch (outcome.kind) {
    case 'GameScore': {
      const [a, b] = outcome.games;
      return a > b ? players[0] : a < b ? players[1] : null;
    }
    case 'Forfeit':
      return players.find((id) => id !== outcome.forfeitedBy)!;
    case 'GrantedWin':
      return outcome.winner;
    case 'GrantedDraw':
      return null;
  }
}

/**
 * The seeds of a bracket of `size`, a power of two, in bracket place order, each
 * pair a round 1 match: every seed s of the bracket half the size is
 * followed by the seed it meets, size + 1 − s.
 */
function seedLayout(size: number): number[] {
  let layout = [1];
  for (let length = 2; length <= size; length *= 2) {
    layout = layout.flatMap((seed) => [seed, length + 1 - seed]);
  }
  return layout;
}
