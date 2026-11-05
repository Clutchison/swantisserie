import type {
  CardFace,
  CardImages,
  DraftView,
  PickView,
  PoolCardView,
  PoolSnapshotView,
  PoolSourceView,
  Rarity,
  TurnView,
} from 'contract';
import { currentTurn } from 'engine';
import { avatarUrl } from '../auth/avatar-url.js';
import { cubeUrl } from '../cubecobra/cubecobra-client.js';
import type { PoolCard } from '../generated/prisma/client.js';
import type { DraftWithOrganizer } from './draft-reads.service.js';
import { draftSize } from './draft-shapes.js';
import { UNEXPECTED_SNAPSHOT_FAILURE } from './pool-snapshot.service.js';
import type { LoggedPick } from './turns.service.js';

/** The draft as viewers see it: never its webhook's URL. */
export function toDraftView(draft: DraftWithOrganizer): DraftView {
  const { state } = draft;
  return {
    id: draft.id,
    name: draft.name,
    poolSource: toPoolSourceView(draft),
    picksPerPlayer: draft.picksPerPlayer,
    platform: draft.platform,
    organizer: draft.organizer,
    snapshot: toSnapshotView(draft),
    players: draft.players.map(({ user }) => ({
      id: user.id,
      name: user.name,
      avatarUrl: avatarUrl(user),
      isBot: user.isBot,
    })),
    ...(state === 'Drafting' || state === 'Paused'
      ? { state, turn: toTurnView(draft) }
      : { state, turn: null }),
    // Built field by field, so nothing else about the webhook (its URL above
    // all) can slip into what every viewer is sent.
    webhook: draft.webhook && {
      id: draft.webhook.id,
      name: draft.webhook.name,
    },
    version: draft.version,
  };
}

function toPoolSourceView(draft: DraftWithOrganizer): PoolSourceView {
  // The database's check constraints set exactly the kind's own columns.
  const { poolSourceKind: kind, poolQuery, cubeId, cubeName } = draft;
  switch (kind) {
    case 'PoolQuery':
      return { kind: 'pool-query', poolQuery: poolQuery ?? '' };
    case 'Cube':
      return {
        kind: 'cube',
        cube: { name: cubeName ?? '', url: cubeUrl(cubeId ?? '') },
      };
    default: {
      const unhandled: never = kind;
      throw new Error(
        `Draft ${draft.id} has pool source kind ${String(unhandled)}.`,
      );
    }
  }
}

function toSnapshotView(draft: DraftWithOrganizer): PoolSnapshotView {
  const cards = draft._count.pool;
  const total = draft.poolTotal;
  switch (draft.snapshotState) {
    case 'Running':
      return { state: 'Running', cards, total };
    case 'Complete':
      // Every snapshot sets its total before it completes; the cards it holds
      // are the pool, should an older one not have.
      return { state: 'Complete', cards, total: total ?? cards };
    case 'Failed':
      return {
        state: 'Failed',
        cards,
        total,
        error: draft.snapshotError ?? UNEXPECTED_SNAPSHOT_FAILURE,
      };
  }
}

/** Whose turn it is in a Drafting or Paused draft, which always has one. */
function toTurnView(draft: DraftWithOrganizer): TurnView {
  const turn = currentTurn(
    draftSize(draft, draft.players.length),
    draft._count.picks,
  );
  // A pick that makes every pick also moves the draft to Complete, and a pick
  // import that would make every pick is refused.
  if (!turn) {
    throw new Error(
      `Draft ${draft.id} is ${draft.state} with every pick made.`,
    );
  }
  return {
    pick: turn.pick,
    round: turn.round,
    playerId: draft.players[turn.seat].user.id,
  };
}

/** A pick in the draft's pick log. */
export function toPickView(pick: LoggedPick): PickView {
  return {
    pick: pick.number,
    playerId: pick.player.userId,
    poolCardId: pick.poolCardId,
  };
}

/** A card in the draft's pool. */
export function toPoolCardView(card: PoolCard): PoolCardView {
  return {
    id: card.id,
    scryfallId: card.scryfallId,
    name: card.name,
    set: card.set,
    collectorNumber: card.collectorNumber,
    typeLine: card.typeLine,
    colors: card.colors,
    manaValue: card.manaValue,
    manaCost: card.manaCost,
    oracleText: card.oracleText,
    colorIdentity: card.colorIdentity,
    keywords: card.keywords,
    rarity: card.rarity as Rarity,
    layout: card.layout,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    defense: card.defense,
    faces: card.faces as unknown as CardFace[],
    images: card.images as unknown as CardImages[],
  };
}
