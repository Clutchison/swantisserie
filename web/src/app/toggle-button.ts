import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideCheck } from '@lucide/angular';

/**
 * An on/off setting labelled in words, such as Hide picked, on a button whose
 * click flips it. Its label stays the same either way; pressed shows a check.
 * The button keeps its own `disabled` and `(click)`; add `wraps` to its class
 * when its label can be too long for a phone.
 */
@Component({
  selector: 'button[appToggleButton]',
  imports: [LucideCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    type: 'button',
    class: 'toggle-button labelled',
    '[attr.aria-pressed]': 'pressed()',
  },
  template: `@if (pressed()) {
      <svg lucideCheck size="16" aria-hidden="true"></svg>
    }
    <ng-content />`,
})
export class ToggleButton {
  readonly pressed = input.required<boolean>();
}
