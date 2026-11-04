import type { DraftView, PoolSourceView, TurnView } from 'contract';
import { currentTurn } from 'engine';
import { avatarUrl } from '../auth/avatar-url.js';
import { cubeUrl } from '../cubecobra/cubecobra-client.js';
import type { DraftWithOrganizer } from './draft-reads.service.js';
import { draftSize } from './draft-shapes.js';

/** The draft as viewers see it: never its webhook's URL. */
export function toDraftView(draft: DraftWithOrganizer): DraftView {
  return {
    id: draft.id,
    name: draft.name,
    poolSource: toPoolSourceView(draft),
    picksPerPlayer: draft.picksPerPlayer,
    platform: draft.platform,
    state: draft.state,
    organizer: draft.organizer,
    snapshot: {
      state: draft.snapshotState,
      cards: draft._count.pool,
      total: draft.poolTotal,
      ...(draft.snapshotError === null ? {} : { error: draft.snapshotError }),
    },
    players: draft.players.map(({ user }) => ({
      id: user.id,
      name: user.name,
      avatarUrl: avatarUrl(user),
      isBot: user.isBot,
    })),
    turn: toTurnView(draft),
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

function toTurnView(draft: DraftWithOrganizer): TurnView | null {
  if (draft.state !== 'Drafting' && draft.state !== 'Paused') return null;
  const turn = currentTurn(
    draftSize(draft, draft.players.length),
    draft._count.picks,
  );
  if (!turn) return null;
  return {
    pick: turn.pick,
    round: turn.round,
    playerId: draft.players[turn.seat].user.id,
  };
}
