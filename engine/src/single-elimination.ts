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
 * in its tournament round, from 0. Bracket place p of a round is fed by the winners
 * of places 2p and 2p + 1 of the round before. A null second player makes it
 * a bye, which only round 1 has.
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
 * The next tournament round of a bracket from `winners`, the player each
 * bracket place of the round before sends on, in bracket place order, or
 * null where nobody advances: the winners of neighbouring bracket places
 * meet. A player whose would-be opponent is null has a bye, and a bracket
 * place nobody reaches is left out.
 */
export function nextBracketRound(
  winners: readonly (string | null)[],
): BracketMatch[] {
  return Array.from({ length: winners.length / 2 }, (_, bracketPlace) => {
    const [first = null, second = null] = [
      winners[2 * bracketPlace],
      winners[2 * bracketPlace + 1],
    ].filter((id) => id !== null);
    return first === null
      ? null
      : { bracketPlace, players: [first, second] as const };
  }).filter((match) => match !== null);
}

/**
 * A match of a bracket, or a bye when its second player is null, as
 * progression reads it; a null outcome is unreported, and a bye has none.
 */
export interface BracketResult {
  players: readonly [string, string | null];
  outcome: MatchOutcome | null;
}

/**
 * The player a bracket match, or a bye, sends on to the next tournament
 * round, `dropped` holding every player who has dropped: the match's
 * winner, or the player with the bye. Nobody advances from a forfeit whose
 * players both dropped, nor from the bye of a player who dropped, so
 * whoever would have met its winner has a bye. Null too while the match is
 * unreported.
 */
export function advancingPlayer(
  { players, outcome }: BracketResult,
  dropped: readonly string[],
): string | null {
  const [first, second] = players;
  if (second === null) return dropped.includes(first) ? null : first;
  if (
    outcome === null ||
    bothDropped({ players: [first, second], outcome }, dropped)
  ) {
    return null;
  }
  return winnerOf({ players: [first, second], outcome });
}

/** Whether `match` is a forfeit that both its players dropped from, which nobody wins. */
function bothDropped(match: DecidedMatch, dropped: readonly string[]) {
  return (
    match.outcome.kind === 'Forfeit' &&
    match.players.every((id) => dropped.includes(id))
  );
}

/** A match's tournament round and its bracket place in it. */
export interface RoundAndBracketPlace {
  round: number;
  bracketPlace: number;
}

/**
 * The later matches of a bracket of `roundCount` tournament rounds that
 * depend on the match at `round` and `bracketPlace`, round by round up to the final: each
 * is fed by the one before, so a change of its winner changes who plays
 * them.
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

/** One bracket place of a tournament round: its two sides, and its winner once its result is agreed. */
export interface BracketPlace {
  bracketPlace: number;
  sides: [BracketSide, BracketSide];
  /** The player who won its match, or had its bye; null until its result is agreed. */
  winner: string | null;
}

/** One tournament round of a bracket, its bracket places in order. */
export interface BracketRound {
  round: number;
  places: BracketPlace[];
}

/** A match of a bracket paired so far, at its tournament round and bracket place, with its winner once its result is agreed. */
export interface PlayedBracketMatch extends BracketMatch {
  round: number;
  /** Null until its result is agreed (see agreedWinnerOf); a bye's player wins it. */
  winner: string | null;
}

/**
 * Every tournament round of a bracket of `roundCount` rounds, from the
 * matches paired so far, `played`. A bracket place not yet paired has a
 * side for each place of the round before feeding it: that place's winner
 * once its result is agreed, else the winner to come of that place.
 */
export function bracketRounds(
  roundCount: number,
  played: readonly PlayedBracketMatch[],
): BracketRound[] {
  const rounds: BracketRound[] = [];
  for (let round = 1; round <= roundCount; round++) {
    const previous = rounds.at(-1)?.places ?? [];
    const fedBy = (bracketPlace: number): BracketSide => {
      const winner = previous[bracketPlace]?.winner;
      return winner
        ? { kind: 'Player', playerId: winner }
        : { kind: 'WinnerToCome', bracketPlace };
    };
    const places = Array.from(
      { length: 2 ** (roundCount - round) },
      (_, bracketPlace): BracketPlace => {
        const match = played.find(
          (m) => m.round === round && m.bracketPlace === bracketPlace,
        );
        if (!match) {
          return {
            bracketPlace,
            sides: [fedBy(2 * bracketPlace), fedBy(2 * bracketPlace + 1)],
            winner: null,
          };
        }
        const [first, second] = match.players;
        return {
          bracketPlace,
          sides: [
            { kind: 'Player', playerId: first },
            second === null
              ? { kind: 'Bye' }
              : { kind: 'Player', playerId: second },
          ],
          winner: match.winner,
        };
      },
    );
    rounds.push({ round, places });
  }
  return rounds;
}

/** A decided single elimination match as reported: who reported its game score, and whether it is confirmed. */
export interface ReportedMatch extends DecidedMatch {
  reportedBy: string | null;
  confirmed: boolean;
}

/**
 * The winner of `match` once its result is agreed, so that the bracket
 * moves them on to their next bracket place; null until then. A result is
 * agreed once its tournament round is completed (`roundCompleted`), and
 * before that when it is a granted win, a forfeit, a game score the other
 * player confirmed, or one someone not playing in it, an organizer,
 * entered. A player's unconfirmed report isn't agreed yet.
 */
export function agreedWinnerOf(
  match: ReportedMatch,
  roundCompleted: boolean,
): string | null {
  const { outcome, players, reportedBy, confirmed } = match;
  const agreed =
    roundCompleted ||
    outcome.kind !== 'GameScore' ||
    confirmed ||
    reportedBy === null ||
    !players.includes(reportedBy);
  return agreed ? winnerOf(match) : null;
}

/**
 * The standings of a single elimination tournament's `players`, in seed
 * order, after `matches`, with `byes` holding the player with each bye: by
 * the tournament round each reached, as counted by the matches they won,
 * byes included, so the winner of the final ranks first alone. Players out
 * in the same tournament round, or still in it, share a rank and keep seed
 * order, the rank after a shared one skipping, as in 1, 1, 3. Unreported
 * matches count for nothing, and so does a forfeit whose players both
 * dropped, `dropped` holding every player who has.
 */
export function singleEliminationStandings(
  players: readonly string[],
  matches: readonly TournamentMatch[],
  byes: readonly string[],
  dropped: readonly string[] = [],
): Standing[] {
  const decided = matches.filter(
    (match): match is DecidedMatch =>
      match.outcome !== null &&
      !bothDropped({ players: match.players, outcome: match.outcome }, dropped),
  );
  const table = players.map((playerId) =>
    standingOf(playerId, decided, byes.filter((id) => id === playerId).length),
  );
  return ranked(table, (a, b) => b.matches.won - a.matches.won);
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
