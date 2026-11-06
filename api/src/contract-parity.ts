import type {
  BasicLand,
  MatchOutcomeView,
  DraftState,
  PlanBoard,
  Platform,
  PoolSnapshotState,
  PoolSourceKind,
  StealBehavior,
  TournamentFormat,
  TournamentState,
} from 'contract';
import type {
  MatchOutcome as EngineMatchOutcome,
  StealBehavior as EngineStealBehavior,
} from 'engine';
import type { STORED_POOL_SOURCE_KIND } from './drafts/pool-source.js';
import type * as Schema from './generated/prisma/enums.js';

/** True when A and B are the same union of values. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

/**
 * Fails typecheck when a contract or engine union and its schema enum list
 * different values, so neither can change without the other. Exported only
 * so it isn't reported as unused; nothing imports it.
 */
export type ContractMatchesSchema = [
  Expect<Same<BasicLand, Schema.BasicLand>>,
  Expect<Same<DraftState, Schema.DraftState>>,
  Expect<Same<PlanBoard, Schema.PlanBoard>>,
  Expect<Same<Platform, Schema.Platform>>,
  Expect<Same<PoolSnapshotState, Schema.PoolSnapshotState>>,
  // Each contract kind is stored as its own schema kind, and every schema kind is one.
  Expect<
    Same<
      (typeof STORED_POOL_SOURCE_KIND)[PoolSourceKind],
      Schema.PoolSourceKind
    >
  >,
  Expect<Same<StealBehavior, Schema.StealBehavior>>,
  Expect<Same<EngineStealBehavior, Schema.StealBehavior>>,
  Expect<Same<TournamentFormat, Schema.TournamentFormat>>,
  Expect<Same<TournamentState, Schema.TournamentState>>,
  Expect<Same<MatchOutcomeView['kind'], Schema.MatchOutcomeKind>>,
  Expect<
    Same<EngineMatchOutcome['kind'] | 'Unreported', Schema.MatchOutcomeKind>
  >,
];
