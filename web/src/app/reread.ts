import { DestroyRef, effect, type Injector, type Signal } from '@angular/core';

/** A resource that can be read afresh, as `httpResource` makes. */
interface Rereadable {
  readonly isLoading: Signal<boolean>;
  reload(): boolean;
}

/**
 * Reads `resource` afresh, and settles once that read has loaded or failed,
 * as a change does before focus goes back, so the page shows what it did. A
 * load still in flight may have been sent before the change, and `reload`
 * does nothing while one is, so this waits that load out before reading.
 * Once the component `injector` belongs to is gone, it settles at once.
 */
export async function reread(resource: Rereadable, injector: Injector) {
  await loaded(resource, injector);
  resource.reload();
  await loaded(resource, injector);
}

/** Settles once no load of `resource` is in flight, or the component is gone. */
function loaded(resource: Rereadable, injector: Injector) {
  return new Promise<void>((resolve) => {
    const destroyRef = injector.get(DestroyRef);
    if (destroyRef.destroyed) return resolve();
    const unlisten = destroyRef.onDestroy(resolve);
    const watch = effect(
      () => {
        if (resource.isLoading()) return;
        watch.destroy();
        unlisten();
        resolve();
      },
      { injector },
    );
  });
}
