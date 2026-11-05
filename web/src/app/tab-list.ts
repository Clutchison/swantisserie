import { FocusKeyManager, type FocusableOption } from '@angular/cdk/a11y';
import { contentChildren, Directive, ElementRef, inject, Injector, input } from '@angular/core';

/**
 * A tab of an `appTabList`, on a button whose click selects it. Bind it to
 * whether it is the selected tab: only that one is a Tab stop.
 */
@Directive({
  selector: 'button[appTab]',
  host: {
    role: 'tab',
    '[attr.aria-selected]': 'selected()',
    '[attr.tabindex]': 'selected() ? 0 : -1',
  },
})
export class Tab implements FocusableOption {
  readonly element = inject<ElementRef<HTMLButtonElement>>(ElementRef).nativeElement;

  readonly selected = input.required<boolean>({ alias: 'appTab' });

  /** The key manager skips a disabled tab. */
  get disabled() {
    return this.element.disabled;
  }

  focus() {
    this.element.focus();
  }
}

/**
 * A tablist following the WAI-ARIA tabs pattern with automatic activation:
 * Left and Right move to the previous and next enabled tab, wrapping around,
 * Home and End to the first and last, and moving to a tab selects it.
 */
@Directive({
  selector: '[appTabList]',
  host: {
    role: 'tablist',
    '(keydown)': 'keyPressed($event)',
  },
})
export class TabList {
  private readonly tabs = contentChildren(Tab, { descendants: true });
  private readonly keys = new FocusKeyManager(this.tabs, inject(Injector))
    .withHorizontalOrientation('ltr')
    .withHomeAndEnd()
    .withWrap();

  protected keyPressed(event: KeyboardEvent) {
    const from = this.tabs().find((tab) => tab.element === event.target);
    if (!from) return;
    this.keys.updateActiveItem(from);
    this.keys.onKeydown(event);
    const to = this.keys.activeItem;
    // Selecting is a click, so the page's own handler runs as it does for a pointer.
    if (to && to !== from) to.element.click();
  }
}
