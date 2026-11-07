import { ActiveDescendantKeyManager, type Highlightable, _IdGenerator } from '@angular/cdk/a11y';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  type ConnectedPosition,
} from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { setsMatching } from './set-search';

/** A set as the combobox finds and shows it. */
export interface ComboboxSet {
  readonly code: string;
  readonly name: string;
}

/** Below the field if the list fits, or else above it. */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
];

/** How a set reads in the field and in the list, such as "Onslaught · ONS". */
const setText = (set: ComboboxSet) => `${set.name} · ${set.code.toUpperCase()}`;

/** One set in the combobox's list, which the arrow keys highlight. */
@Directive({
  selector: '[appComboboxOption]',
  host: {
    role: 'option',
    '[id]': 'id',
    '[attr.aria-selected]': 'active()',
    '[class.active]': 'active()',
  },
})
export class ComboboxOption implements Highlightable {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly set = input.required<ComboboxSet>({ alias: 'appComboboxOption' });
  readonly id = inject(_IdGenerator).getId('set-option-');
  readonly active = signal(false);

  setActiveStyles() {
    this.active.set(true);
    // jsdom doesn't scroll.
    this.element.nativeElement.scrollIntoView?.({ block: 'nearest' });
  }

  setInactiveStyles() {
    this.active.set(false);
  }
}

/**
 * Chooses a set by typing part of its code or name: a text field, labelled
 * "Set", with a list of sets below it that narrows as the viewer types, a
 * set whose code is just what was typed first and the rest in the order
 * given. With the list closed the field shows the set chosen; focusing it
 * opens the full list with that text selected, so typing replaces it.
 * Enter or a click chooses a set; Escape, or leaving the field, closes the
 * list and puts the chosen set's text back.
 */
@Component({
  selector: 'app-set-combobox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, ComboboxOption],
  templateUrl: './set-combobox.html',
  styleUrl: './set-combobox.scss',
})
export class SetCombobox<S extends ComboboxSet> {
  /** The sets to choose from, in the order the list gives them. */
  readonly sets = input.required<readonly S[]>();
  /** The set chosen, which the field shows while the list is closed. */
  readonly chosen = input.required<S>();
  /** A set the viewer chose. */
  readonly chose = output<S>();

  private readonly ids = inject(_IdGenerator);
  protected readonly fieldId = this.ids.getId('set-field-');
  protected readonly listId = this.ids.getId('set-list-');
  protected readonly positions = POSITIONS;
  protected readonly setText = setText;

  protected readonly open = signal(false);
  /** What the viewer typed since the list opened, or null if nothing yet, for the full list. */
  private readonly typed = signal<string | null>(null);
  /** What the field shows: what was typed, or else the set chosen. */
  protected readonly text = computed(() => this.typed() ?? setText(this.chosen()));
  /** The sets the list offers: those that match what was typed, a set with that very code first. */
  protected readonly options = computed(() => {
    const typed = this.typed();
    if (typed === null) return this.sets();
    const code = typed.trim().toLowerCase();
    const matches = setsMatching(this.sets(), typed);
    return [
      ...matches.filter((set) => set.code === code),
      ...matches.filter((set) => set.code !== code),
    ];
  });

  private readonly items = viewChildren(ComboboxOption);
  protected readonly keys = new ActiveDescendantKeyManager(this.items, inject(Injector)).withWrap();

  constructor() {
    // Each time the list changes, highlights the set chosen in the full list, or else the first match.
    effect(() => {
      const items = this.items();
      untracked(() => {
        const chosen = this.typed() === null && items.find((item) => item.set() === this.chosen());
        if (chosen) this.keys.setActiveItem(chosen);
        else if (items.length > 0) this.keys.setFirstItemActive();
        else this.keys.updateActiveItem(-1);
      });
    });
  }

  protected focused(field: HTMLInputElement) {
    this.typed.set(null);
    this.open.set(true);
    field.select();
  }

  protected input(field: HTMLInputElement) {
    this.typed.set(field.value);
    this.open.set(true);
  }

  protected keydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (this.open()) this.keys.onKeydown(event);
        else this.open.set(true);
        return;
      case 'Enter': {
        if (!this.open()) return;
        event.preventDefault();
        const active = this.keys.activeItem;
        if (active) this.choose(active.set() as S);
        return;
      }
      case 'Escape':
        if (!this.open()) return;
        // Closes only the list, not the dialog it's in.
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
    }
  }

  protected choose(set: S) {
    this.close();
    this.chose.emit(set);
  }

  /** Closes the list, the field showing the set chosen again. */
  protected close() {
    this.open.set(false);
    this.typed.set(null);
  }
}
