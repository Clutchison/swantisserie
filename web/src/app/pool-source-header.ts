import type { NamedPoolSourceView } from 'contract';
import { setsText } from './drafts/drafts';

/** How a pool source shows on the Trophy Hall, in its Tournament summaries and on My stats: its title, and where it links, if anywhere. */
export interface PoolSourceHeader {
  title: string;
  href: string | null;
}

/** A pool source's header: its cube's name, linked to CubeCobra; its pool query, linked to Scryfall; or its sets' names. */
export function poolSourceHeader(source: NamedPoolSourceView): PoolSourceHeader {
  switch (source.kind) {
    case 'cube':
      return { title: source.cube.name, href: source.cube.url };
    case 'pool-query':
      return {
        title: source.poolQuery,
        href: `https://scryfall.com/search?q=${encodeURIComponent(source.poolQuery)}`,
      };
    case 'set-list':
      return {
        title: setsText(
          source.setList.map(({ name, sublists }) => ({
            name,
            sublists: sublists.map((sublist) => sublist.name),
          })),
        ),
        href: null,
      };
  }
}
