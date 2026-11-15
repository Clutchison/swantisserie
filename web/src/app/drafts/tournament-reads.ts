import { httpResource } from '@angular/common/http';
import { computed, effect, inject, Injector, type Signal } from '@angular/core';
import type {
  DecklistView,
  DraftView,
  PoolCardView,
  PreferredPrintings,
  TournamentState,
  ViewerTournamentView,
} from 'contract';
import { ARENA_SIDEBOARD_CAP, type ExportPlan } from './export-plan';
import { type DraftRead, keptRead } from './kept-read';
import { planBoardCount } from './plan-boards';

/** What the tournament reads are read for: the open draft, and its signed-in viewer. */
export interface TournamentReadsOf {
  /** The id of the open draft. */
  readonly id: Signal<string>;
  /** The draft, undefined until it has loaded. */
  readonly draft: Signal<DraftView | undefined>;
  /** The version of the draft shown. */
  readonly version: Signal<number | undefined>;
  /** The signed-in viewer's user id. */
  readonly userId: Signal<string | undefined>;
  /** What the signed-in player's exports are made of. */
  readonly exportPlan: Signal<ExportPlan<PoolCardView>>;
}

/**
 * The draft page's reads of the draft's tournament: the tournament as the
 * signed-in viewer reads it, its decklists, and what they say of the
 * viewer's deck: whether it is locked, and whether its exported sideboard is
 * over Arena's cap. The `DraftStore` composes them, and exposes them through
 * members of its own, which say more of each.
 */
export interface TournamentReads {
  /** The draft's tournament: null until it has loaded, and while there is none. */
  readonly tournament: DraftRead<ViewerTournamentView | null>;
  /** The state of the draft's tournament; undefined until it has loaded, and while there is none. */
  readonly state: Signal<TournamentState | undefined>;
  /** Answers once the tournament read for the draft shown has settled, loaded or failed. */
  whenSettled(): Promise<void>;
  /** Re-reads the draft's tournament. */
  reread(): void;
  /** Whether decklists are shown; undefined while the draft or its tournament is still loading. */
  readonly showDecklists: Signal<boolean | undefined>;
  /** The tournament's decklists, in join order: none until they have loaded. */
  readonly decklists: DraftRead<DecklistView[]>;
  /** Shows the signed-in player's preferred printings on their own decklist, if it is shown. */
  showPreferredPrintings(preferredPrintings: PreferredPrintings): void;
  /** Whether the signed-in player has joined the draft's tournament. */
  readonly joined: Signal<boolean>;
  /** Whether the signed-in player's deck is locked. */
  readonly deckLocked: Signal<boolean>;
  /** Whether the signed-in player's deck locks at Start. */
  readonly deckLocksAtStart: Signal<boolean>;
  /** The exported sideboard's count and Arena's cap, when it holds more; otherwise null. */
  readonly sideboardOverArenaCap: Signal<{ count: number; cap: number } | null>;
}

/** The tournament reads of the draft `of` names. Call it in an injection context. */
export function tournamentReads(of: TournamentReadsOf): TournamentReads {
  const injector = inject(Injector);

  /**
   * The tournament is read once the draft says it has one, and again for
   * each version, as every tournament change bumps it, and after each change
   * to the player's deck during registration (see `DraftStore.changePlan`).
   */
  // Stryker disable next-line OptionalChaining: the draft is undefined only before its first load, when a throw here would only error a read that the load re-runs.
  const hasTournament = computed(() => !!of.draft()?.tournament);
  const tournamentResource = httpResource<ViewerTournamentView>(() => {
    of.version();
    return hasTournament() ? `/api/drafts/${of.id()}/tournament` : undefined;
  });
  const tournament = keptRead<ViewerTournamentView | null>(tournamentResource, null);
  const state = computed(() => tournament.value()?.state);

  /**
   * As the tournament's `showsDecklists` says, which the api decides (ADR
   * 0003). False with no tournament, or none loaded.
   */
  const showDecklists = computed(() => {
    if (!of.draft()) return undefined;
    if (!hasTournament()) return false;
    if (!tournament.loaded()) return tournament.failed() ? false : undefined;
    return tournament.value()!.showsDecklists;
  });
  /**
   * The decklists are read once the tournament shows them. They are the
   * decks as they were when it started, so no change re-reads them.
   */
  const decklistsResource = httpResource<DecklistView[]>(() =>
    showDecklists() ? `/api/drafts/${of.id()}/tournament/decklists` : undefined,
  );

  const joined = computed(() => {
    const id = of.userId();
    return !!tournament.value()?.entries.some((entry) => entry.playerId === id);
  });

  return {
    tournament,
    state,
    whenSettled: () =>
      new Promise((resolve) => {
        const watch = effect(
          () => {
            if (tournamentResource.isLoading()) return;
            watch.destroy();
            resolve();
          },
          { injector },
        );
      }),
    reread: () => tournamentResource.reload(),
    showDecklists,
    // Stryker disable next-line ArrayDeclaration: the Lists tab reads the decklists only once they have loaded, showing loading or the error before then.
    decklists: keptRead<DecklistView[]>(decklistsResource, []),
    showPreferredPrintings: (preferredPrintings) => {
      const userId = of.userId();
      if (decklistsResource.hasValue()) {
        decklistsResource.update((decklists) =>
          decklists!.map((decklist) =>
            decklist.playerId === userId ? { ...decklist, preferredPrintings } : decklist,
          ),
        );
      }
    },
    joined,
    deckLocked: computed(() => joined() && state() === 'Playing'),
    deckLocksAtStart: computed(() => joined() && state() === 'Registration'),
    sideboardOverArenaCap: computed(() => {
      const count = planBoardCount(of.exportPlan(), 'Sideboard');
      return of.draft()!.platform === 'Arena' && count > ARENA_SIDEBOARD_CAP
        ? { count, cap: ARENA_SIDEBOARD_CAP }
        : null;
    }),
  };
}
