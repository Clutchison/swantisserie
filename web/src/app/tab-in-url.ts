import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

/** A page's tabs, kept in its URL's `tab` query parameter. */
export interface TabInUrl<T extends string> {
  /** The tab shown. */
  readonly selected: Signal<T>;
  /** Selects `tab`, writing it to the URL in place of the current history entry. */
  select(tab: T): void;
}

/**
 * Keeps the page's selected tab in its URL, as `?tab=` the tab's name in
 * lowercase. Call it in the page's injection context.
 */
export function tabInUrl<T extends string>({
  tabs,
  defaultTab,
  canOpen = () => true,
}: {
  /** The page's tabs, by name. */
  tabs: readonly T[];
  /** The tab a URL without one opens. */
  defaultTab: T;
  /** Whether the viewer may open `tab`. */
  canOpen?: (tab: T) => boolean;
}): TabInUrl<T> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const requested = toSignal(route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: null,
  });
  const selected = computed(() => {
    const named = tabs.find((tab) => tab.toLowerCase() === requested());
    return named && canOpen(named) ? named : defaultTab;
  });
  /** Points the URL at `tab`: the default tab leaves the parameter out. */
  const write = (tab: T) =>
    void router.navigate([], {
      relativeTo: route,
      queryParams: { tab: tab === defaultTab ? null : tab.toLowerCase() },
      queryParamsHandling: 'merge',
      preserveFragment: true,
      replaceUrl: true,
    });
  return { selected, select: write };
}
