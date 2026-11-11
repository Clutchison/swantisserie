import type { PoolCardView } from 'contract';
import { FACE_SEPARATOR, frontFace } from 'engine';
import { planBoardLines, type ExportPlan } from './export-plan';

/** What an MTGO export needs of a picked card. */
export type MtgoExportCard = Pick<PoolCardView, 'name' | 'layout' | 'typeLine'>;

/**
 * The plan in MTGO's deck import format, with no header: the mainboard's
 * `1 Card Name` lines, with copies of a card on one line, as `2 Card Name`,
 * and its basics. A sideboard follows after a blank line, with its basics,
 * unless it's empty.
 */
export function mtgoExport(plan: ExportPlan<MtgoExportCard>): string {
  const lines = planBoardLines(plan, 'Mainboard', mtgoName);
  const sideboardLines = planBoardLines(plan, 'Sideboard', mtgoName);
  if (sideboardLines.length > 0) lines.push('', ...sideboardLines);
  return lines.join('\n');
}

/**
 * The name MTGO knows a card by: split cards by both faces joined by a slash,
 * as `Fire/Ice`, though Rooms keep Scryfall's `A // B`. Other multi-face cards
 * go by their front face, and meld cards are one face already.
 */
function mtgoName({ name, layout, typeLine }: MtgoExportCard): string {
  if (layout === 'split') return isRoom(typeLine) ? name : name.replaceAll(FACE_SEPARATOR, '/');
  return frontFace(name);
}

function isRoom(typeLine: string): boolean {
  return /\bRoom\b/.test(typeLine);
}
