import type { TournamentFormat } from 'contract';

/** Single elimination's last tournament rounds by name, from the final back, as far as the bracket has them. */
const NAMED_ROUNDS = ['Final', 'Semifinal', 'Quarterfinal'];

/**
 * Tournament round `round` of `roundCount` by name: in single elimination
 * the last three are the final, semifinal and quarterfinal; every other
 * round is "Tournament round 2".
 */
export function roundName(format: TournamentFormat, round: number, roundCount: number): string {
  const named = format === 'SingleElimination' ? NAMED_ROUNDS[roundCount - round] : undefined;
  return named ?? `Tournament round ${round}`;
}

/** `roundName` in running text: "in the final", "in tournament round 2". */
export function inRound(format: TournamentFormat, round: number, roundCount: number): string {
  const name = roundName(format, round, roundCount);
  return name.startsWith('Tournament round')
    ? `in ${name.charAt(0).toLowerCase()}${name.slice(1)}`
    : `in the ${name.toLowerCase()}`;
}
