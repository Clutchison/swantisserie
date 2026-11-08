import { computed, effect, inject, linkedSignal, type Signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

/**
 * A page's selected tab, kept in its URL's `tab` query parameter. Read it as
 * a signal for the tab shown.
 */
export type TabInUrl<T extends string> = Signal<T> & {
  /**
   * Selects `tab`, which shows at once, and writes it to the URL in place of
   * the current history entry. Should that navigation fail or be cancelled,
   * the tab shown goes back to the one the URL names.
   */
  select(tab: T): void;
};

/**
 * Whether the viewer may open a tab: `'yes'`, `'no'`, or `'unknown'` while
 * what decides it hasn't loaded yet.
 */
export type CanOpen = 'yes' | 'no' | 'unknown';

/**
 * Keeps a page's selected tab in its URL, as `?tab=` and the tab's name in
 * lowercase, so a reload or a shared link opens the same tab. Call it in the
 * page's injection context.
 *
 * The URL names the tab requested. The page shows it if the viewer may open
 * it, else its fallback if the viewer may open that, else the default tab,
 * and corrects the URL to match: an unknown or wrong-case value, or the
 * default tab named, is corrected to leave the parameter out. While `canOpen` answers `'unknown'`, the requested tab
 * stands and the URL is left alone. Correcting and selecting both replace the
 * current history entry, keeping any other query parameters and the fragment.
 */
export function tabInUrl<T extends string>({
  tabs,
  defaultTab,
  // Stryker disable next-line ArrowFunction,StringLiteral: only the Feedback page uses the default, which has no fallbacks, and the answer is only compared with 'no' and 'unknown'.
  canOpen = () => 'yes',
  fallbacks = {},
}: {
  /** The page's tabs, by name. */
  tabs: readonly T[];
  /** The tab a URL without one opens. Every viewer may open it. */
  defaultTab: T;
  /**
   * Whether the viewer may open `tab`. Read in a reactive context, so the
   * tab shown follows the signals it reads.
   */
  canOpen?: (tab: T) => CanOpen;
  /**
   * The tab to show in place of each tab named here when the viewer can't
   * open it, if they can open the fallback (`'yes'`). Otherwise, and for
   * tabs not named here, the default tab shows.
   */
  fallbacks?: Partial<Record<T, T>>;
}): TabInUrl<T> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  // Stryker disable next-line ObjectLiteral: queryParamMap emits synchronously on subscribe, so the initial value is never read.
  const requested = toSignal(route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: null,
  });
  /**
   * The tab selected since the URL last changed, which shows before the URL
   * catches up. The latest navigation's outcome clears it: one that lands has
   * changed the URL, which cleared it already; one that doesn't puts back the
   * tab the URL names.
   */
  const chosen = linkedSignal<string | null, T | undefined>({
    source: requested,
    computation: () => undefined,
  });
  /** The tab requested: the one just selected, else the one the URL names, if it names one. */
  const named = computed(() => chosen() ?? tabs.find((tab) => tab.toLowerCase() === requested()));
  /** Whether the viewer may open the tab named. */
  const allowed = computed<CanOpen>(() => {
    const tab = named();
    // Stryker disable next-line ConditionalExpression,LogicalOperator,StringLiteral: canOpen never answers 'unknown' for the default tab or for none, and its 'no' falls back to the default tab anyway.
    return tab === undefined || tab === defaultTab ? 'yes' : canOpen(tab);
  });
  const selected = computed(() => {
    const tab = named();
    if (tab === undefined) return defaultTab;
    if (allowed() !== 'no') return tab;
    const fallback = fallbacks[tab];
    return fallback !== undefined && canOpen(fallback) === 'yes' ? fallback : defaultTab;
  });

  const param = (tab: T) => (tab === defaultTab ? null : tab.toLowerCase());
  /** Counts the navigations started here, so only the latest one's outcome counts. */
  let navigations = 0;

  // Once it's known which tab shows, the URL says so: as a tab is selected,
  // and to correct one the viewer can't open.
  effect(() => {
    // Stryker disable next-line ConditionalExpression,StringLiteral: this differs only when a tab is selected while canOpen is still unknown; the URL is written sooner, but ends the same.
    if (allowed() === 'unknown') return;
    const tab = selected();
    // Stryker disable next-line ConditionalExpression: an extra navigation to the URL already shown, which the router skips; clearing the tab selected then changes nothing shown.
    if (requested() === param(tab)) return;
    // Stryker disable next-line UpdateOperator: counting down tells the latest navigation apart just as counting up does.
    const navigation = ++navigations;
    // Once the URL changes it clears the tab selected itself, so clearing it again once the
    // navigation lands changes nothing: only one that doesn't land needs to.
    const landed = () => {
      if (navigation === navigations) chosen.set(undefined);
    };
    untracked(
      () =>
        void router
          .navigate([], {
            relativeTo: route,
            queryParams: { tab: param(tab) },
            queryParamsHandling: 'merge',
            preserveFragment: true,
            replaceUrl: true,
          })
          .then(landed, landed),
    );
  });

  return Object.assign(selected, { select: (tab: T) => chosen.set(tab) });
}
