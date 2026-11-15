import { afterNextRender, inject, PendingTasks, signal, type Signal } from '@angular/core';

/**
 * Whether a live region that may already have something to say on its first
 * render may say it yet. A screen reader announces text put into a live
 * region, not text it was inserted with, so a region with text from the start
 * stays empty for two frames, until the browser has it in its accessibility
 * tree; one with nothing to say yet may speak at once, as whatever it says
 * later changes a region already there. Call from an injection context, such
 * as a constructor.
 */
export function liveRegionReady(hasText: () => boolean): Signal<boolean> {
  const ready = signal(false);
  const pendingTasks = inject(PendingTasks);
  afterNextRender(() => {
    if (hasText()) {
      pendingTasks.run(() => afterTwoFrames().then(() => ready.set(true)));
    } else {
      ready.set(true);
    }
  });
  return ready.asReadonly();
}

/** Resolves once two frames have gone by, so the browser has painted the first. */
function afterTwoFrames() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
