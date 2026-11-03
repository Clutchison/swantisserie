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
  },
})
export class TopBarMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  /** The button's text; without one, it shows the menu icon, named by `accessibleName`. */
  readonly label = input<string>();
  /** Names the button, and is its tooltip, when it shows only the menu icon. */
  readonly accessibleName = input<string>();

  protected readonly open = signal(false);

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

  protected escapePressed() {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger().nativeElement.focus();
  }
}
