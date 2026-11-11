import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import type {
  NamedSetView,
  PoolCardView,
  TrophyHallPoolSourceView,
  TrophyHallRowView,
  TrophyHallView,
} from 'contract';
import { CardImageSource } from '../drafts/card-image-source';
import { CardPreviews } from '../drafts/card-preview';
import { Decklist } from '../drafts/decklist';
import { LoadingAnimation } from '../loading/loading-animation';

/**
 * The Trophy Hall: every trophy and the deck that won it, grouped by pool
 * source, the group of the newest trophy first. Each row's View Deck
 * expands its holder's decklist under it. Fetched afresh on each visit.
 */
@Component({
  selector: 'app-trophy-hall-page',
  imports: [Decklist, LoadingAnimation],
  // One Card preview for the page, whichever decklists are expanded.
  providers: [CardImageSource, CardPreviews],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trophy-hall-page.html',
  styleUrls: ['../page.scss', './trophy-hall-page.scss'],
})
export class TrophyHallPage {
  protected readonly hall = httpResource<TrophyHallView>(() => '/api/trophy-hall');
  /** The rows whose decklists are expanded, by `rowKey`. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  /** Each row's cards by id, as its decklist reads them. */
  protected readonly cards = computed(
    () =>
      new Map(
        (this.hall.value()?.groups ?? [])
          .flatMap((group) => group.rows)
          .map((row): [TrophyHallRowView, ReadonlyMap<string, PoolCardView>] => [
            row,
            new Map(row.cards.map((card) => [card.id, card])),
          ]),
      ),
  );

  protected readonly title = title;
  protected readonly scryfallSearch = scryfallSearch;

  /** What tells the row apart from every other: a player holds a tournament's trophy at most once. */
  protected rowKey(row: TrophyHallRowView): string {
    return `${row.draftId}-${row.playerId}`;
  }

  /** Expands the row's decklist, or collapses it when it is expanded. */
  protected toggle(row: TrophyHallRowView) {
    const key = this.rowKey(row);
    this.expanded.update((keys) => {
      const next = new Set(keys);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }
}

/** What heads a group: its cube's name, its pool query, or its sets' names. */
function title(source: TrophyHallPoolSourceView): string {
  switch (source.kind) {
    case 'cube':
      return source.cube.name;
    case 'pool-query':
      return source.poolQuery;
    case 'set-list':
      return source.setList
        .map(({ name, sublists }) =>
          sublists.length === 0 ? name : `${name} (+ ${names(sublists)})`,
        )
        .join(', ');
  }
}

const names = (sets: NamedSetView[]) => sets.map((set) => set.name).join(', ');

/** The pool query's search on Scryfall. */
function scryfallSearch(poolQuery: string): string {
  return `https://scryfall.com/search?q=${encodeURIComponent(poolQuery)}`;
}
