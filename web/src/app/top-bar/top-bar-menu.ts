import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { LucideMenu } from '@lucide/angular';

/** A top bar button that opens a panel of the projected items below the bar, over the page. */
@Component({
  selector: 'app-top-bar-menu',
  imports: [LucideMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar-menu.html',
  styleUrl: './top-bar-menu.scss',
  host: {
    '(document:click)': 'documentClicked($event)',
    '(document:keydown.escape)': 'escapePressed()',
    '(focusout)': 'focusLeft($event)',
  },
})
export class TopBarMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  /** The button's text; without one, it shows the menu icon, named by `accessibleName`. */
  readonly label = input<string>();
  /** Names the button, and is its tooltip, when it shows only the menu icon. */
  readonly accessibleName = input<string>();
  /** Which edge of the button the panel lines up with: its start, or its end for a menu at the bar's far end. */
  readonly align = input<'start' | 'end'>('start');

  protected readonly open = signal(false);

  /** The button that opens the panel, for focus to return to once an item it held has gone. */
  button(): HTMLButtonElement {
    return this.trigger().nativeElement;
  }

  protected toggle() {
    this.open.update((open) => !open);
  }

  /** Only links and buttons are items: a heading in the panel is not something to choose. */
  protected panelClicked(event: MouseEvent) {
    if ((event.target as Element).closest('a, button')) this.open.set(false);
  }

  protected documentClicked(event: MouseEvent) {
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  /** Focus moving to the page outside, as by tabbing past the last item, closes it where focus went. */
  protected focusLeft(event: FocusEvent) {
    const to = event.relatedTarget as Node | null;
    if (to && !this.host.nativeElement.contains(to)) this.open.set(false);
  }

  protected escapePressed() {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger().nativeElement.focus();
  }
}
