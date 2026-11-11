import type { PlaceView, TallyView } from 'contract';

/** A record as pages show it: won–lost–drawn, such as 2–1–0. */
export function record({ won, lost, drawn }: TallyView): string {
  return `${won}–${lost}–${drawn}`;
}

/**
 * A percentage from 0 to 100 as pages show it: rounded, with a % sign,
 * such as 67%. Empty if absent, as the opponents' percentages are in
 * round robin, whose standings don't show them.
 */
export function percent(value: number | undefined): string {
  return value === undefined ? '' : `${Math.round(value)}%`;
}

/** A place in standings as pages show it: an ordinal, marked with = when shared, such as 1st or =2nd. */
export function place({ rank, shared }: PlaceView): string {
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th');
  return `${shared ? '=' : ''}${rank}${suffix}`;
}

/** Words, such as a result ("won") or a format's name, as a line starts with them: "Won". */
export function capitalised(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}
