import {
  type PlanBoard,
  type PlanBoards,
  type PlannedBasicView,
  type PlannedCardView,
} from 'contract';
import { isBasicLand } from '../drafts/basic-lands.js';
import { isPlanBoard } from '../drafts/plan-boards.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Thrown when a tournament entry's decklist snapshot is missing or isn't a deck's boards. */
export class MalformedDecklistError extends Error {
  constructor() {
    super('A joined player’s decklist snapshot is missing or malformed.');
  }
}

/** A deck's boards as `TournamentEntry.decklist` snapshots them. */
export function encodeDecklist(boards: PlanBoards): Prisma.InputJsonObject {
  return {
    mainboard: boards.mainboard.map(encodeCard),
    sideboard: boards.sideboard.map(encodeCard),
    basics: boards.basics.map(({ land, board, count }) => ({
      land,
      board,
      count,
    })),
  };
}

/**
 * The deck's boards `TournamentEntry.decklist` snapshots. Throws
 * MalformedDecklistError if it holds none, or anything but a deck's boards,
 * so no decklist is ever served without them.
 */
export function decodeDecklist(json: Prisma.JsonValue | null): PlanBoards {
  if (!isObject(json)) throw new MalformedDecklistError();
  const { mainboard, sideboard, basics } = json;
  if (
    !isListOf(mainboard, isCard) ||
    !isListOf(sideboard, isCard) ||
    !isListOf(basics, isBasic)
  ) {
    throw new MalformedDecklistError();
  }
  return {
    mainboard: mainboard.map(decodeCard),
    sideboard: sideboard.map(decodeCard),
    // A snapshot kept before basics had a plan board holds them all on the
    // mainboard.
    basics: basics.map(({ land, board, count }) => ({
      land,
      board: board ?? 'Mainboard',
      count,
    })),
  };
}

const encodeCard = ({ poolCardId, name, picked }: PlannedCardView) => ({
  poolCardId,
  name,
  picked,
});

const decodeCard = ({
  poolCardId,
  name,
  picked,
}: PlannedCardView): PlannedCardView => ({ poolCardId, name, picked });

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isListOf<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(isItem);
}

function isCard(value: unknown): value is PlannedCardView {
  return (
    isObject(value) &&
    typeof value.poolCardId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.picked === 'boolean'
  );
}

/** A basic as a snapshot holds it: one kept before basics had a plan board has none. */
type SnapshotBasic = Omit<PlannedBasicView, 'board'> & { board?: PlanBoard };

function isBasic(value: unknown): value is SnapshotBasic {
  return (
    isObject(value) &&
    typeof value.land === 'string' &&
    isBasicLand(value.land) &&
    (value.board === undefined || isPlanBoard(value.board)) &&
    Number.isInteger(value.count) &&
    (value.count as number) > 0
  );
}
