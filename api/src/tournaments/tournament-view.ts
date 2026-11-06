import type {
  MatchOutcomeView,
  MatchView,
  TournamentRoundView,
  TournamentView,
} from 'contract';
import {
  roundRobinSchedule,
  standings,
  swissRoundCount,
  swissStandings,
  trophyHolders,
  type TournamentMatch,
} from 'engine';
import type { Prisma } from '../generated/prisma/client.js';

/** What the tournament read selects of a tournament. */
export const TOURNAMENT_VIEW = {
  format: true,
  swissRoundOption: true,
  state: true,
  lastCompletedRound: true,
  entries: {
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      dropped: true,
      player: { select: { userId: true } },
    },
  },
  matches: {
    orderBy: [{ round: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      round: true,
      firstEntryId: true,
      secondEntryId: true,
      outcome: true,
      firstGames: true,
      secondGames: true,
      drawnGames: true,
      forfeitedBy: true,
      reportedById: true,
      confirmed: true,
    },
  },
} satisfies Prisma.TournamentSelect;

type TournamentRow = Prisma.TournamentGetPayload<{
  select: typeof TOURNAMENT_VIEW;
}>;
type MatchRow = TournamentRow['matches'][number];

/**
 * The tournament as everyone who sees its draft reads it: its entries in
 * join order, its rounds in order, each round's matches in the order of
 * their first players' joining, and its standings and trophy holders. A
 * Swiss tournament's standings count its byes; round robin's ignore them,
 * as every player has equally many.
 */
export function toTournamentView(row: TournamentRow): TournamentView {
  const order = new Map(row.entries.map((entry, i) => [entry.id, i]));
  const userOf = new Map(
    row.entries.map((entry) => [entry.id, entry.player.userId]),
  );
  const user = (entryId: string) => userOf.get(entryId)!;

  const rounds: TournamentRoundView[] = [];
  const sorted = [...row.matches].sort(
    (a, b) =>
      a.round - b.round ||
      order.get(a.firstEntryId)! - order.get(b.firstEntryId)!,
  );
  for (const match of sorted) {
    let round = rounds.at(-1);
    if (round?.round !== match.round) {
      round = { round: match.round, matches: [], bye: null };
      rounds.push(round);
    }
    if (match.secondEntryId === null) round.bye = user(match.firstEntryId);
    else round.matches.push(toMatchView(match, user));
  }

  const players = row.entries.map((entry) => entry.player.userId);
  const matches = rounds
    .flatMap((round) => round.matches)
    .map(toTournamentMatch);
  const byes = rounds.flatMap((round) => (round.bye ? [round.bye] : []));
  const table =
    row.state === 'Registration'
      ? []
      : row.format === 'Swiss'
        ? swissStandings(players, matches, byes)
        : standings(players, matches);
  return {
    format: row.format,
    swissRoundOption: row.swissRoundOption,
    state: row.state,
    roundCount: roundCount(row, players.length),
    lastCompletedRound: row.lastCompletedRound,
    entries: row.entries.map((entry) => ({
      playerId: entry.player.userId,
      dropped: entry.dropped,
    })),
    rounds,
    standings: table,
    trophyHolders: row.state === 'Complete' ? trophyHolders(table) : [],
  };
}

/** How many tournament rounds the tournament has, or will have with `joined` players; none for fewer than 2. */
function roundCount(
  { format, swissRoundOption }: TournamentRow,
  joined: number,
): number {
  if (joined < 2) return 0;
  return format === 'Swiss'
    ? swissRoundCount(joined, swissRoundOption!)
    : roundRobinSchedule(Array.from({ length: joined }, String)).length;
}

function toMatchView(
  match: MatchRow,
  user: (entryId: string) => string,
): MatchView {
  const players: [string, string] = [
    user(match.firstEntryId),
    user(match.secondEntryId!),
  ];
  return {
    id: match.id,
    players,
    outcome: toOutcome(match, players),
    reportedBy: match.reportedById,
    confirmed: match.confirmed,
  };
}

function toOutcome(
  match: MatchRow,
  [first, second]: [string, string],
): MatchOutcomeView {
  switch (match.outcome) {
    case 'Unreported':
    case 'GrantedDraw':
      return { kind: match.outcome };
    case 'GameScore':
      return {
        kind: 'GameScore',
        games: [match.firstGames, match.secondGames],
        draws: match.drawnGames,
      };
    case 'Forfeit':
      return {
        kind: 'Forfeit',
        forfeitedBy: match.forfeitedBy === 'First' ? first : second,
      };
  }
}

function toTournamentMatch({ players, outcome }: MatchView): TournamentMatch {
  return {
    players,
    outcome: outcome.kind === 'Unreported' ? null : outcome,
  };
}
