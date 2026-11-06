import { computed, effect, inject, linkedSignal, type Signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

/** A page's tabs, kept in its URL's `tab` query parameter. */
export interface TabInUrl<T extends string> {
  /** The tab shown. */
  readonly selected: Signal<T>;
  /**
   * Selects `tab`, which shows at once, and writes it to the URL in place of
   * the current history entry.
   */
  select(tab: T): void;
}

/**
 * Keeps a page's selected tab in its URL, as `?tab=` and the tab's name in
 * lowercase, so a reload or a shared link opens the same tab. Call it in the
 * page's injection context.
 *
 * The URL names the tab requested. The page shows it if the viewer may open
 * it, else the default tab, and corrects the URL to match: an unknown or
 * wrong-case value, or the default tab named, is corrected to leave the
 * parameter out. While `canOpen` doesn't yet know, the requested tab stands
 * and the URL is left alone. Correcting and selecting both replace the
 * current history entry, keeping any other query parameters and the fragment.
 */
export function tabInUrl<T extends string>({
  tabs,
  defaultTab,
  canOpen = () => true,
}: {
  /** The page's tabs, by name. */
  tabs: readonly T[];
  /** The tab a URL without one opens. Every viewer may open it. */
  defaultTab: T;
  /**
   * Whether the viewer may open `tab`, or undefined while that isn't known
   * yet (such as while what decides it loads). Read in a reactive context,
   * so the tab shown follows the signals it reads.
   */
  canOpen?: (tab: T) => boolean | undefined;
}): TabInUrl<T> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const requested = toSignal(route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: null,
  });
  /** The tab selected since the URL last changed, which shows before the URL catches up. */
  const chosen = linkedSignal<string | null, T | undefined>({
    source: requested,
    computation: () => undefined,
  });
  /** The tab requested: the one just selected, else the one the URL names, if it names one. */
  const named = computed(() => chosen() ?? tabs.find((tab) => tab.toLowerCase() === requested()));
  /** Whether the viewer may open the tab named: undefined while not yet known. */
  const allowed = computed(() => {
    const tab = named();
    return tab === undefined || tab === defaultTab ? true : canOpen(tab);
  });
  const selected = computed(() => {
    const tab = named();
    return tab !== undefined && allowed() !== false ? tab : defaultTab;
  });

  const param = (tab: T) => (tab === defaultTab ? null : tab.toLowerCase());

  // Once it's known which tab shows, the URL says so: as a tab is selected,
  // and to correct one the viewer can't open.
  effect(() => {
    if (allowed() === undefined) return;
    const tab = selected();
    if (requested() === param(tab)) return;
    untracked(
      () =>
        void router.navigate([], {
          relativeTo: route,
          queryParams: { tab: param(tab) },
          queryParamsHandling: 'merge',
          preserveFragment: true,
          replaceUrl: true,
        }),
    );
  });

  return { selected, select: (tab) => chosen.set(tab) };
}
