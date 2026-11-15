import type { HttpResourceRef } from '@angular/common/http';
import { computed, linkedSignal, type Signal } from '@angular/core';

/**
 * One of the page's reads of the api: the last value it loaded, and whether
 * it is loading or its latest read failed.
 */
export interface DraftRead<T> {
  /**
   * The last value the read loaded, kept when a later re-read fails, or its
   * empty value until it has loaded.
   */
  readonly value: Signal<T>;
  /** Whether the read has loaded a value, which `value` then holds. */
  readonly loaded: Signal<boolean>;
  /** Whether the read is on its way and has nothing to show yet. */
  readonly loading: Signal<boolean>;
  /**
   * Whether the latest read failed: with nothing loaded if `loaded` is false,
   * or else a re-read, while `value` keeps the last good one.
   */
  readonly failed: Signal<boolean>;
  /** Whether the read failed with nothing loaded, so there is nothing to show. */
  readonly missing: Signal<boolean>;
}

/** What a read keeps: the last value it loaded, if it has loaded one. */
interface Kept<T> {
  readonly value: T;
  readonly loaded: boolean;
}

/**
 * A read that keeps the last value it loaded when a later re-read fails, and
 * isn't loading as it re-reads once it has a value: `value` is `empty` until
 * it has loaded, and again once there is nothing to read (the resource is
 * idle).
 */
export function keptRead<T>(resource: HttpResourceRef<T | undefined>, empty: T): DraftRead<T> {
  const kept = linkedSignal<Kept<T> | 'idle' | 'none', Kept<T>>({
    source: () =>
      resource.status() === 'idle'
        ? 'idle'
        : resource.hasValue()
          ? { value: resource.value()!, loaded: true }
          : 'none',
    computation: (latest, previous) =>
      latest === 'idle'
        ? // Stryker disable next-line BooleanLiteral: an idle read has no error, and every reader of `loaded` returns early for the states that leave a read idle.
          { value: empty, loaded: false }
        : latest === 'none'
          ? (previous?.value ?? { value: empty, loaded: false })
          : latest,
  });
  const loaded = computed(() => kept().loaded);
  const failed = computed(() => !!resource.error());
  return {
    value: computed(() => kept().value),
    loaded,
    loading: computed(() => resource.isLoading() && !loaded()),
    failed,
    missing: computed(() => failed() && !loaded()),
  };
}
