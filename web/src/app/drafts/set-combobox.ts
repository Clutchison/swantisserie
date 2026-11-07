import { ActiveDescendantKeyManager, type Highlightable } from '@angular/cdk/a11y';
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
  DOCUMENT,
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
import { type FindableSet, setsMatchingCodeFirst } from './set-search';

/** Numbers the ids each combobox and option gives itself, so each is unique on the page. */
let lastId = 0;
const nextId = (prefix: string) => `${prefix}${++lastId}`;

/** Below the field if the list fits, or else above it. */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
];

/** How a set reads in the field and in the list, such as "Onslaught · ONS". */
const setText = (set: FindableSet) => `${set.name} · ${set.code.toUpperCase()}`;

/** One set in the combobox's list, which the arrow keys highlight. */
@Directive({
  selector: '[appSetOption]',
  host: {
    role: 'option',
    '[id]': 'id',
    '[attr.aria-selected]': 'active()',
    '[class.active]': 'active()',
  },
})
export class SetOption implements Highlightable {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The set it offers. */
  readonly set = input.required<FindableSet>({ alias: 'appSetOption' });
  /** Its id, which the field names as its active descendant while it is highlighted. */
  readonly id = nextId('set-option-');
  /** Whether it is the option highlighted. */
  readonly active = signal(false);

  /** Highlights it, scrolling it into the list's view. */
  setActiveStyles() {
    this.active.set(true);
    // jsdom doesn't scroll.
    this.element.nativeElement.scrollIntoView?.({ block: 'nearest' });
  }

  /** Takes its highlight away. */
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
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, SetOption],
  templateUrl: './set-combobox.html',
  styleUrl: './set-combobox.scss',
})
export class SetCombobox<S extends FindableSet> {
  /** The sets to choose from, in the order the list gives them. */
  readonly sets = input.required<readonly S[]>();
  /** The set chosen, which the field shows while the list is closed. */
  readonly chosen = input.required<S>();
  /** A set the viewer chose. */
  readonly chose = output<S>();

  private readonly document = inject(DOCUMENT);
  protected readonly fieldId = nextId('set-field-');
  protected readonly listId = nextId('set-list-');
  protected readonly positions = POSITIONS;
  protected readonly setText = setText;

  protected readonly open = signal(false);
  /** Whether the mouseup of the press that focused the field is still to come, which would undo selecting its text. */
  private pressFocusing = false;
  /** What the viewer typed since the list opened, or null if nothing yet, for the full list. */
  private readonly typed = signal<string | null>(null);
  /** What the field shows: what was typed, or else the set chosen. */
  protected readonly text = computed(() => this.typed() ?? setText(this.chosen()));
  /** The sets the list offers: those that match what was typed, a set with that very code first. */
  protected readonly options = computed(() => {
    const typed = this.typed();
    return typed === null ? this.sets() : setsMatchingCodeFirst(this.sets(), typed);
  });

  private readonly items = viewChildren(SetOption);
  protected readonly keys = new ActiveDescendantKeyManager(this.items, inject(Injector)).withWrap();

  constructor() {
    // Each time the list opens or the viewer types, highlights the set
    // chosen in the full list, or else the first match.
    effect(() => {
      const items = this.items();
      const typed = this.typed();
      untracked(() => {
        const chosen = typed === null && items.find((item) => item.set() === this.chosen());
        if (chosen) this.keys.setActiveItem(chosen);
        else if (items.length > 0) this.keys.setFirstItemActive();
        else this.keys.updateActiveItem(-1);
      });
    });
  }

  /** Opens the full list, the chosen set's text selected so typing replaces it. */
  protected focused(field: HTMLInputElement) {
    this.typed.set(null);
    this.open.set(true);
    field.select();
  }

  /** Notes a press on the field that is about to focus it. */
  protected pressed(field: HTMLInputElement) {
    this.pressFocusing = this.document.activeElement !== field;
  }

  /** Keeps the text selected through the end of the press that focused the field, as browsers would put the caret there. */
  protected released(event: MouseEvent) {
    if (this.pressFocusing) event.preventDefault();
    this.pressFocusing = false;
  }

  /** Narrows the list to the sets that match what is typed. */
  protected input(field: HTMLInputElement) {
    this.typed.set(field.value);
    this.open.set(true);
  }

  /** Moves the highlight on the arrow keys, chooses on Enter, and closes the list on Escape. */
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
        const set = active && this.options()[this.items().indexOf(active)];
        if (set) this.choose(set);
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

  /** Chooses `set`, closing the list. */
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
