import type { TallyView } from 'contract';

/** A record as pages show it: won–lost–drawn, such as 2–1–0. */
export function record({ won, lost, drawn }: TallyView): string {
  return `${won}–${lost}–${drawn}`;
}

/**
 * A percentage from 0 to 100 as pages show it: rounded, with a % sign,
 * such as 67%. Empty if absent, as Swiss's opponents' percentages are in
 * round robin.
 */
export function percent(value: number | undefined): string {
  return value === undefined ? '' : `${Math.round(value)}%`;
}

/** Words, such as a result ("won") or a format's name, as a line starts with them: "Won". */
export function capitalised(result: string): string {
  return result.charAt(0).toUpperCase() + result.slice(1);
}
