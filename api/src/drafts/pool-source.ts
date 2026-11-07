import type {
  PoolSourceKind as ContractKind,
  SetListEntryView,
} from 'contract';
import type { PoolSourceKind, Prisma } from '../generated/prisma/client.js';

/**
 * The kind a draft stores for each kind of pool source, by the contract's
 * name for it: the one place the two names are tied. contract-parity.ts
 * fails typecheck unless every stored kind is here.
 */
export const STORED_POOL_SOURCE_KIND = {
  'pool-query': 'PoolQuery',
  cube: 'Cube',
  'set-list': 'SetList',
} as const satisfies Record<ContractKind, PoolSourceKind>;

/** True for a kind of pool source the contract names. */
export function isPoolSourceKind(value: unknown): value is ContractKind {
  return (
    typeof value === 'string' && Object.hasOwn(STORED_POOL_SOURCE_KIND, value)
  );
}

/**
 * A draft's stored set list. The draft creation is all that writes it, from
 * a checked set list, and the database's check constraint makes it a
 * non-empty array.
 */
export function storedSetList(setList: Prisma.JsonValue): SetListEntryView[] {
  return setList as unknown as SetListEntryView[];
}
