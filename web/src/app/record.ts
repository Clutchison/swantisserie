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

/**
 * A place in a list in words, as a screen reader should hear it: "first",
 * "twenty-third". Past 99 it reads as digits, such as 100th.
 */
export function ordinalWords(position: number): string {
  if (position >= 1 && position < 20) return FIRST_TO_NINETEENTH[position - 1];
  if (position >= 20 && position < 100) {
    const tens = Math.floor(position / 10) - 2;
    const ones = position % 10;
    return ones === 0 ? TENS_ORDINAL[tens] : `${TENS[tens]}-${FIRST_TO_NINETEENTH[ones - 1]}`;
  }
  return place({ rank: position, shared: false });
}

const FIRST_TO_NINETEENTH = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const TENS_ORDINAL = [
  'twentieth',
  'thirtieth',
  'fortieth',
  'fiftieth',
  'sixtieth',
  'seventieth',
  'eightieth',
  'ninetieth',
];

/** Words, such as a result ("won") or a format's name, as a line starts with them: "Won". */
export function capitalised(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}
