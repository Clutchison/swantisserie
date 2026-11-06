import type { TallyView } from 'contract';

/** A record as pages show it: won–lost–drawn, such as 2–1–0. */
export function record({ won, lost, drawn }: TallyView): string {
  return `${won}–${lost}–${drawn}`;
}
