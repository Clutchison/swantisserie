import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { createNoopScrollStrategy, type PositionStrategy } from '@angular/cdk/overlay';
import type { ComponentType } from '@angular/cdk/portal';
import {
  type Binding,
  DestroyRef,
  DOCUMENT,
  inject,
  Injectable,
  type Injector,
} from '@angular/core';

/** How a dialog opened on the shell is named, shown and closed. */
export interface DialogShellConfig {
  /**
   * The dialog's accessible name: `label` names it outright, `labelledBy`
   * by the id of an element in it, such as its heading. Give one.
   */
  label?: string;
  labelledBy?: string;
  /**
   * The injector the dialog's component is made from, for what it injects
   * from its opener's context: pass the opener's own. The dialog closes
   * once that injector's component, or whatever else owns it, is destroyed.
   * Without one it gets only what the app provides.
   */
  injector?: Injector;
  /** The component's inputs and outputs, as `inputBinding` and `outputBinding` make them. */
  bindings?: Binding[];
  /**
   * Where focus goes once the dialog has closed, however it closed. It's
   * given the element focused when the dialog opened, its opener, which is
   * where focus goes without this; an element gone from the page, or none,
   * leaves focus where it is.
   */
  returnFocus?: (opener: HTMLElement | null) => HTMLElement | null | undefined;
}

/**
 * The CDK places an overlay with its position strategy; the shell's CSS
 * places a dialog's pane itself, over the whole screen, so this does nothing.
 */
const PLACED_BY_CSS: PositionStrategy = { attach() {}, apply() {}, dispose() {} };

/**
 * Opens every dialog in the app, as a modal over the page: a backdrop
 * behind it, focus moved into it and kept there, the page behind hidden
 * from assistive technology, and focus put back once it closes.
 *
 * Focus moves on open to the dialog's control marked `cdkFocusInitial`, or
 * else its first. Escape closes it, as does a click on the backdrop, so
 * long as the press began there: a text selection dragged out of the
 * dialog ends in a click outside it.
 *
 * The dialog's component closes it with the `DialogRef` it injects.
 */
@Injectable({ providedIn: 'root' })
export class DialogShell {
  private readonly dialog = inject(Dialog);
  private readonly document = inject(DOCUMENT);

  open<C, R = unknown>(component: ComponentType<C>, config: DialogShellConfig): DialogRef<R, C> {
    const focused = this.document.activeElement;
    const opener =
      focused instanceof HTMLElement && focused !== this.document.body ? focused : null;
    const ref = this.dialog.open<R, unknown, C>(component, {
      ariaLabel: config.label ?? null,
      ariaLabelledBy: config.labelledBy ?? null,
      ariaModal: true,
      injector: config.injector,
      bindings: config.bindings,
      autoFocus: 'first-tabbable',
      // The shell closes it, as below, and puts focus back itself.
      disableClose: true,
      restoreFocus: false,
      panelClass: 'dialog-pane',
      backdropClass: 'dialog-backdrop',
      positionStrategy: PLACED_BY_CSS,
      scrollStrategy: createNoopScrollStrategy(),
      width: '',
      maxWidth: '',
      disableAnimations: true,
    });

    ref.keydownEvents.subscribe((event) => {
      if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      ref.close();
    });

    let pressedBackdrop = false;
    const pressed = (event: MouseEvent) => {
      pressedBackdrop = event.target === ref.overlayRef.backdropElement;
    };
    this.document.addEventListener('mousedown', pressed, true);
    ref.backdropClick.subscribe(() => {
      if (pressedBackdrop) ref.close();
    });

    // Made for the opener, the dialog goes with it: as when a page it was opened from closes.
    const unlisten = config.injector?.get(DestroyRef, null)?.onDestroy(() => ref.close());

    ref.closed.subscribe(() => {
      unlisten?.();
      this.document.removeEventListener('mousedown', pressed, true);
      const target = config.returnFocus ? config.returnFocus(opener) : opener;
      const active = this.document.activeElement;
      // Focus moved on by the viewer, or by whatever closed the dialog, stays put.
      if (active && active !== this.document.body) return;
      if (target?.isConnected) target.focus();
    });
    return ref;
  }
}
