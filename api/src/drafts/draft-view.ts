import { currentTurn } from 'engine';
import type {
  DraftState,
  PoolSnapshotState,
} from '../generated/prisma/client.js';
import { avatarUrl } from '../auth/avatar-url.js';
import type { WebhookView } from '../discord/webhooks.service.js';
import type { DraftWithOrganizer } from './drafts.service.js';

/** How far the pool snapshot has got. */
export interface PoolSnapshotView {
  state: PoolSnapshotState;
  /** Cards snapshotted so far: the pool size once Complete. */
  cards: number;
  /** Cards Scryfall says the pool query matches; null until the first page arrives. */
  total: number | null;
  /** Why the snapshot failed, when it has. */
  error?: string;
}

/** A role-holder or bot who has joined a draft. */
export interface PlayerView {
  id: string;
  name: string;
  avatarUrl: string;
  /** A player the app controls, which an app admin added for testing. */
  isBot: boolean;
}

/** Whose turn it is. */
export interface TurnView {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  round: number;
  playerId: string;
}

/** A draft, as every viewer is sent it. */
export interface DraftView {
  id: string;
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
  state: DraftState;
  organizer: { id: string; name: string };
  snapshot: PoolSnapshotView;
  /** In seat order. */
  players: PlayerView[];
  /** Null unless the draft is Drafting or Paused. */
  turn: TurnView | null;
  /** Where the draft's announcements are posted; null for none. */
  webhook: WebhookView | null;
  /** Higher for a newer copy of the draft; snapshot progress leaves it be. */
  version: number;
  createdAt: Date;
}

/** The draft as viewers see it: never its webhook's URL. */
export function toDraftView(draft: DraftWithOrganizer): DraftView {
  return {
    id: draft.id,
    name: draft.name,
    poolQuery: draft.poolQuery,
    picksPerPlayer: draft.picksPerPlayer,
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
    createdAt: draft.createdAt,
  };
}

function toTurnView(draft: DraftWithOrganizer): TurnView | null {
  if (draft.state !== 'Drafting' && draft.state !== 'Paused') return null;
  const turn = currentTurn(
    { players: draft.players.length, picksPerPlayer: draft.picksPerPlayer },
    draft._count.picks,
  );
  if (!turn) return null;
  return {
    pick: turn.pick,
    round: turn.round,
    playerId: draft.players[turn.seat].user.id,
  };
}
