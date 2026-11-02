import type { DraftState, Platform, PoolSnapshotState } from 'contract';
import type * as Schema from './generated/prisma/enums.js';

/** True when A and B are the same union of values. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

/**
 * Fails typecheck when a contract union and its schema enum list different
 * values, so neither can change without the other. Exported only so it
 * isn't reported as unused; nothing imports it.
 */
export type ContractMatchesSchema = [
  Expect<Same<DraftState, Schema.DraftState>>,
  Expect<Same<Platform, Schema.Platform>>,
  Expect<Same<PoolSnapshotState, Schema.PoolSnapshotState>>,
];
