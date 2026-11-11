import type {
  PoolSourceKind as ContractKind,
  PoolSourceView,
  SetListEntryView,
} from 'contract';
import { cubeUrl } from '../cubecobra/cubecobra-client.js';
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

/** What a read selects of a draft for `toPoolSourceView`: its pool source's columns. */
export const POOL_SOURCE = {
  id: true,
  poolSourceKind: true,
  poolQuery: true,
  cubeId: true,
  cubeName: true,
  setList: true,
} as const satisfies Prisma.DraftSelect;

/** A draft's stored pool source, as `POOL_SOURCE` selects it. */
export type StoredPoolSource = Prisma.DraftGetPayload<{
  select: typeof POOL_SOURCE;
}>;

/** The draft's pool source as viewers see it. */
export function toPoolSourceView(draft: StoredPoolSource): PoolSourceView {
  // The database's check constraints set exactly the kind's own columns.
  const { poolSourceKind: kind, poolQuery, cubeId, cubeName, setList } = draft;
  switch (kind) {
    case 'PoolQuery':
      return { kind: 'pool-query', poolQuery: poolQuery ?? '' };
    case 'Cube':
      return {
        kind: 'cube',
        cube: { name: cubeName ?? '', url: cubeUrl(cubeId ?? '') },
      };
    case 'SetList':
      return { kind: 'set-list', setList: storedSetList(setList) };
    default: {
      const unhandled: never = kind;
      throw new Error(
        `Draft ${draft.id} has pool source kind ${String(unhandled)}.`,
      );
    }
  }
}
