import type { PoolSourceKind as ContractKind } from 'contract';
import type { PoolSourceKind } from '../generated/prisma/client.js';

/**
 * The kind a draft stores for each kind of pool source, by the contract's
 * name for it: the one place the two names are tied. contract-parity.ts
 * fails typecheck unless every stored kind is here.
 */
export const STORED_POOL_SOURCE_KIND = {
  'pool-query': 'PoolQuery',
  cube: 'Cube',
} as const satisfies Record<ContractKind, PoolSourceKind>;

/** True for a kind of pool source the contract names. */
export function isPoolSourceKind(value: unknown): value is ContractKind {
  return (
    typeof value === 'string' && Object.hasOwn(STORED_POOL_SOURCE_KIND, value)
  );
}
