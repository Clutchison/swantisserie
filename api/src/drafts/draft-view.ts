import type {
  DraftView,
  PoolSnapshotView,
  PoolSourceView,
  TurnView,
} from 'contract';
import { currentTurn } from 'engine';
import { avatarUrl } from '../auth/avatar-url.js';
import { cubeUrl } from '../cubecobra/cubecobra-client.js';
import type { DraftWithOrganizer } from './draft-reads.service.js';
import { draftSize } from './draft-shapes.js';

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
    createdAt: draft.createdAt.toISOString(),
  };
}

function toPoolSourceView(draft: DraftWithOrganizer): PoolSourceView {
  if (draft.cubeId !== null && draft.cubeName !== null) {
    return {
      kind: 'cube',
      cube: { name: draft.cubeName, url: cubeUrl(draft.cubeId) },
    };
  }
  if (draft.poolQuery === null) {
    throw new Error(`Draft ${draft.id} has neither a pool query nor a cube.`);
  }
  return { kind: 'pool-query', poolQuery: draft.poolQuery };
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
      if (draft.snapshotError === null) {
        throw new Error(
          `Draft ${draft.id}'s pool snapshot failed with no error.`,
        );
      }
      return { state: 'Failed', cards, total, error: draft.snapshotError };
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
