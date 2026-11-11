import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  inputBinding,
  signal,
} from '@angular/core';
import type {
  PoolCardView,
  TrophyHallPoolSourceView,
  TrophyHallRowView,
  TrophyHallView,
} from 'contract';
import { CardImageSource } from '../drafts/card-image-source';
import { CardPreviews } from '../drafts/card-preview';
import { Decklist } from '../drafts/decklist';
import { setsText } from '../drafts/drafts';
import { DialogShell } from '../dialog-shell';
import { LoadingAnimation } from '../loading/loading-animation';
import { TOURNAMENT_SUMMARY_HEADING, TournamentSummary } from './tournament-summary';

/** What heads a Trophy Hall group: its pool source's title, and where it links, if anywhere. */
interface GroupHeader {
  title: string;
  href: string | null;
}

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
  private readonly dialogs = inject(DialogShell);
  private readonly injector = inject(Injector);

  protected readonly hall = httpResource<TrophyHallView>(() => '/api/trophy-hall');
  /** The rows whose decklists are expanded, by `rowKey`. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  /** Each group with its header, once the Trophy Hall has loaded. */
  protected readonly groups = computed(() =>
    this.hall.value()!.groups.map((group) => ({ ...group, header: headerOf(group.poolSource) })),
  );

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

  /** What tells the row apart from every other: a player holds a tournament's trophy at most once. */
  protected rowKey(row: TrophyHallRowView): string {
    return `${row.draftId}-${row.playerId}`;
  }

  /** Opens the row's Tournament summary, its pool source as its group is headed by it. */
  protected viewTournament(row: TrophyHallRowView, poolSource: string) {
    this.dialogs.open(TournamentSummary, {
      labelledBy: TOURNAMENT_SUMMARY_HEADING,
      injector: this.injector,
      bindings: [inputBinding('row', () => row), inputBinding('poolSource', () => poolSource)],
    });
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

/** A group's header: its cube's name, linked to CubeCobra; its pool query, linked to Scryfall; or its sets' names. */
function headerOf(source: TrophyHallPoolSourceView): GroupHeader {
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
