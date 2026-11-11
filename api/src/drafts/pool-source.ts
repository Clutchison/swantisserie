import type {
  CubeView,
  NamedPoolSourceView,
  NamedSetView,
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

/**
 * A draft's pool source as viewers see it, but a cube with its CubeCobra
 * id too, which the view gives only as a URL: the Trophy Hall groups cube
 * drafts by it, so a cube whose list changed stays one group.
 */
export type PoolSourceWithCubeId =
  | Exclude<PoolSourceView, { kind: 'cube' }>
  | { kind: 'cube'; cube: CubeView & { id: string } };

/** The draft's pool source as viewers see it, a cube with its CubeCobra id. */
export function toPoolSourceWithCubeId(
  draft: StoredPoolSource,
): PoolSourceWithCubeId {
  const view = toPoolSourceView(draft);
  // The database's check constraints set a cube draft's cube id.
  return view.kind === 'cube'
    ? { kind: 'cube', cube: { id: draft.cubeId ?? '', ...view.cube } }
    : view;
}

/**
 * The draft's pool source as the Trophy Hall and My stats show it: a cube
 * without its CubeCobra id, and each set of a set list named from
 * `setNames`, or by its code in capitals when it has no name there.
 */
export function toNamedPoolSource(
  source: PoolSourceWithCubeId,
  setNames: ReadonlyMap<string, string>,
): NamedPoolSourceView {
  switch (source.kind) {
    case 'cube':
      return {
        kind: 'cube',
        cube: { name: source.cube.name, url: source.cube.url },
      };
    case 'pool-query':
      return source;
    case 'set-list': {
      const named = (code: string): NamedSetView => ({
        code,
        name: setNames.get(code) ?? code.toUpperCase(),
      });
      return {
        kind: 'set-list',
        setList: source.setList.map(({ code, sublists }) => ({
          ...named(code),
          sublists: sublists.map(named),
        })),
      };
    }
  }
}
