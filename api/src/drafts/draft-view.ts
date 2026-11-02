import type { DraftView, TurnView } from 'contract';
import { currentTurn } from 'engine';
import { avatarUrl } from '../auth/avatar-url.js';
import type { DraftWithOrganizer } from './draft-reads.service.js';
import { draftSize } from './draft-shapes.js';

/** The draft as viewers see it: never its webhook's URL. */
export function toDraftView(draft: DraftWithOrganizer): DraftView {
  return {
    id: draft.id,
    name: draft.name,
    poolQuery: draft.poolQuery,
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
