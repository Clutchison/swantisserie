import { afterNextRender, ElementRef, inject, Injectable, Injector } from '@angular/core';

/**
 * Keeps keyboard focus on the control a change was pressed on, through the
 * re-render the change brings: a row that moved, a line rebuilt, or a button
 * swapped for another. Provide one per component; it looks for controls
 * inside that component, by accessible name, so it finds the pressed
 * control again wherever it now is.
 */
@Injectable()
export class KeptFocus {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  /** The names to put focus back on, in order of preference, or null if focus wasn't here. */
  private names: string[] | null = null;

  /**
   * Notes the control a change is being sent from, the one focused in this
   * component, with the controls to fall back on, by name, should it be gone
   * or disabled once the change settles. A change pressed from outside this
   * component, or with nothing focused, keeps nothing.
   */
  press(...fallbacks: string[]) {
    const pressed = this.host.ownerDocument.activeElement;
    this.names =
      pressed instanceof HTMLElement && this.host.contains(pressed)
        ? [accessibleName(pressed), ...fallbacks].filter((name) => name !== '')
        : null;
  }

  /**
   * After the next render, puts focus on the first of the pressed control's
   * names that is still here and enabled, unless the viewer has moved focus
   * elsewhere meanwhile. `settled` forgets the press, as its change is done.
   */
  restore({ settled = true } = {}) {
    const names = this.names;
    if (settled) this.names = null;
    if (!names) return;
    afterNextRender(
      () => {
        const focused = this.host.ownerDocument.activeElement;
        const lost = !focused || focused === this.host.ownerDocument.body;
        if (!lost && !this.host.contains(focused)) return;
        const controls = [...this.host.querySelectorAll<HTMLElement>('button, input')].filter(
          (control) => !(control as HTMLButtonElement).disabled,
        );
        for (const name of names) {
          const control = controls.find((c) => accessibleName(c) === name);
          if (control) {
            if (control !== focused) control.focus();
            return;
          }
        }
      },
      { injector: this.injector },
    );
  }
}

/** A control's accessible name, as far as these components give one: its aria-label, or its text. */
function accessibleName(control: HTMLElement) {
  return control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '';
}
